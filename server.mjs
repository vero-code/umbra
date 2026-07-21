import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPlan,
  seedState,
  validatePlan,
  analyzePhotoWithModel,
  refreshForecast,
  createEvent,
  processEvent,
  parseRosterCsv,
  buildPortfolio,
  assessProperty,
  calculateEnvironmentalExposure,
  scoreWorker,
  getWorkerProfileFactors,
  settingFactors,
  upfFactors,
  spfFactors,
  shadeFactors,
  addTeamMember,
  decisionFromPlan,
  auditWorksitePhoto,
  recordActivity,
  getModelStatus,
  testModelConnection,
  updateBehavioralFactors,
  updateTeamMember,
  removeTeamMember,
  simulateWhatIf,
} from "./src/planner.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const storeDir = join(root, "data");
const storePath = join(storeDir, "umbra.json");
const workerStorePath = join(storeDir, "workers.json");
const objectStorePath = join(storeDir, "objects.json");
const portFlag = process.argv.indexOf("--port");
const port = Number(
  process.env.PORT || (portFlag >= 0 ? process.argv[portFlag + 1] : 3000),
);
const operationKeys = [
  "events",
  "decisions",
  "plans",
  "audit",
  "activity",
  "photoAudits",
];

const emptyOperations = () =>
  Object.fromEntries(operationKeys.map((key) => [key, []]));

function teamOperations(team) {
  if (!team) return null;
  team.operations ||= emptyOperations();
  operationKeys.forEach((key) => {
    team.operations[key] ||= [];
  });
  return team.operations;
}

function hydrateTeamOperations(state, team) {
  const operations = teamOperations(team);
  if (!operations) return;
  operationKeys.forEach((key) => {
    state[key] = operations[key];
  });
}

function persistTeamOperations(state, team) {
  const operations = teamOperations(team);
  if (!operations) return;
  operationKeys.forEach((key) => {
    operations[key] = state[key] || [];
  });
}

const teamId = (profile) =>
  `team_${Buffer.from(
    `${profile?.company || ""}:${profile?.name || ""}`.toLowerCase(),
  )
    .toString("base64url")
    .slice(0, 24)}`;
async function readWorkerStore() {
  return existsSync(workerStorePath)
    ? JSON.parse(await readFile(workerStorePath, "utf8"))
    : { teams: [] };
}
async function saveWorkerStore(store) {
  await mkdir(storeDir, { recursive: true });
  await writeFile(workerStorePath, JSON.stringify(store, null, 2));
}
async function readObjectStore() {
  return existsSync(objectStorePath)
    ? JSON.parse(await readFile(objectStorePath, "utf8"))
    : { objects: seedState().sites };
}
async function saveObjectStore(objects) {
  await mkdir(storeDir, { recursive: true });
  await writeFile(objectStorePath, JSON.stringify({ objects }, null, 2));
}
async function teamFor(profile, create = false) {
  if (!profile?.name || !profile?.company) return { store: null, team: null };
  const store = await readWorkerStore();
  const id = teamId(profile);
  let team = store.teams.find((entry) => entry.id === id);
  if (!team && create) {
    team = {
      id,
      foreman: { name: profile.name, company: profile.company },
      employees: [],
      operations: emptyOperations(),
    };
    store.teams.push(team);
  }
  return { store, team };
}
async function getState(profile) {
  const state = existsSync(storePath)
    ? JSON.parse(await readFile(storePath, "utf8"))
    : seedState();
  state.events ||= [];
  state.decisions ||= [];
  state.activity ||= [];
  state.photoAudits ||= [];
  const storedObjects = (await readObjectStore()).objects;
  state.sites = storedObjects.length
    ? storedObjects
    : seedState().sites.map((site) => ({ ...site, isTemplate: true }));
  state.agent ||= {
    status: "monitoring",
    lastCycleAt: null,
    simulationIndex: 0,
    mode: process.env.OPENAI_API_KEY
      ? "GPT-5.6 reasoning active"
      : "Simulated reasoning for demo",
  };
  const { team } = await teamFor(profile);
  if (team) {
    hydrateTeamOperations(state, team);
  } else if (profile?.name || profile?.company) {
    Object.assign(state, emptyOperations());
  }
  state.workers = team?.employees || [];
  state.portfolio = buildPortfolio(state);
  return state;
}
async function saveState(state, { persistOperations = true } = {}) {
  await mkdir(storeDir, { recursive: true });
  const {
    workers,
    sites,
    events,
    decisions,
    plans,
    audit,
    activity,
    photoAudits,
    portfolio,
    ...persistentState
  } = state;
  if (persistOperations) {
    Object.assign(persistentState, {
      events,
      decisions,
      plans,
      audit,
      activity,
      photoAudits,
    });
  }
  await writeFile(storePath, JSON.stringify(persistentState, null, 2));
  await saveObjectStore(sites.filter((site) => !site.isTemplate));
}

function protectionPreview(state, input) {
  const worker = state.workers.find((entry) => entry.id === input.workerId);
  if (!worker) throw new Error("Team member not found");
  if (!upfFactors[input.upf]) throw new Error("Select protective equipment");
  if (!spfFactors[input.spf]) throw new Error("Select sunscreen use");
  if (!shadeFactors[input.shadeAvailability])
    throw new Error("Select shade availability");
  const sunscreenHoursAgo = Number(input.sunscreenHoursAgo);
  if (
    !Number.isFinite(sunscreenHoursAgo) ||
    sunscreenHoursAgo < 0 ||
    sunscreenHoursAgo > 24
  )
    throw new Error("Sunscreen timing must be between 0 and 24 hours");
  const site =
    state.sites.find((entry) => entry.id === input.siteId) ||
    state.sites.find((entry) => entry.id === worker.siteId) ||
    state.sites[0];
  if (!site) throw new Error("Create a worksite before setting protection");
  const proposedWorker = {
    ...worker,
    siteId: site.id,
    behavioralFactors: {
      upf: input.upf,
      spf: input.spf,
      sunscreenHoursAgo,
      shadeAvailability: input.shadeAvailability,
    },
  };
  const baselineRisk = scoreWorker(site, worker);
  const projectedRisk = scoreWorker(site, proposedWorker);
  const profileFactors = getWorkerProfileFactors(worker);
  const sunscreenExpired = sunscreenHoursAgo > 2;
  const reductionPercent = Math.max(
    0,
    Math.round(
      ((baselineRisk - projectedRisk) / Math.max(baselineRisk, 1)) * 100,
    ),
  );
  const environment = calculateEnvironmentalExposure(site);
  const activeSpfFactor = sunscreenExpired ? 1 : spfFactors[input.spf];
  const protectionFactor =
    upfFactors[input.upf] *
    activeSpfFactor *
    shadeFactors[input.shadeAvailability];
  return {
    site: {
      id: site.id,
      name: site.propertyObjectName || site.name,
      location: site.propertyLocation || site.name,
      image: site.propertyPhotos?.[0]?.image || null,
    },
    worker: { id: worker.id, name: worker.name, role: worker.role },
    environment,
    profileFactors,
    baselineRisk,
    projectedRisk,
    reductionPercent,
    protectionFactor: Math.round(protectionFactor * 100) / 100,
    sunscreenExpired,
    sunscreenStatus:
      input.spf === "none"
        ? "No SPF reduction is applied."
        : sunscreenExpired
          ? `${input.spf.toUpperCase()} is treated as expired after more than two active hours.`
          : `${input.spf.toUpperCase()} remains active in the current protection calculation.`,
    recommendation:
      input.shadeAvailability === "direct" && environment.doseIndex >= 15
        ? "Direct-sun placement remains the highest-risk option at this site."
        : input.shadeAvailability === "canopy"
          ? "Canopy placement provides the strongest available shade reduction."
          : "This protection profile reduces modeled individual exposure for the current site conditions.",
  };
}
function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 25_000_000)
      throw new Error(
        "Payload too large: use smaller site photos (25 MB limit).",
      );
  }
  return raw ? JSON.parse(raw) : {};
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/state")
      return json(
        res,
        200,
        await getState({
          name: url.searchParams.get("foreman"),
          company: url.searchParams.get("company"),
        }),
      );
    if (req.method === "GET" && url.pathname === "/api/model/status")
      return json(res, 200, getModelStatus());
    if (req.method === "POST" && url.pathname === "/api/model/test")
      return json(res, 200, await testModelConnection());
    if (req.method === "POST" && url.pathname === "/api/plan") {
      const state = await getState();
      const input = await body(req);
      const event = createEvent(state, "manual_review_requested", {
        siteId: input.siteId,
      });
      const plan = await createPlan(state, input.siteId, {
        event,
        useModel: input.useModel !== false,
      });
      state.plans.unshift(plan);
      state.decisions.unshift(decisionFromPlan(plan, event));
      event.status = "processed";
      state.portfolio = buildPortfolio(state);
      await saveState(state);
      return json(res, 201, { plan, state });
    }
    if (req.method === "POST" && url.pathname === "/api/refresh-conditions") {
      const state = await getState();
      const { siteId } = await body(req);
      const site = state.sites.find((s) => s.id === siteId);
      if (!site) return json(res, 404, { error: "Site not found" });
      const result = await refreshForecast(site);
      const event = createEvent(state, "conditions_updated", {
        siteId,
        refreshed: result.refreshed,
      });
      const decisions = await processEvent(state, event);
      await saveState(state);
      return json(res, 200, {
        site,
        refreshed: result.refreshed,
        decisions,
        state,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/replan") {
      const state = await getState();
      const input = await body(req);
      const event = createEvent(state, "conditions_updated", {
        siteId: input.siteId,
        trigger: input.trigger || "Conditions changed",
      });
      const decisions = await processEvent(state, event);
      await saveState(state);
      return json(res, 201, { plan: state.plans[0], decisions, state });
    }
    if (req.method === "POST" && url.pathname === "/api/approve") {
      const state = await getState();
      const { planId } = await body(req);
      const plan = state.plans.find((p) => p.id === planId);
      if (!plan) return json(res, 404, { error: "Plan not found" });
      plan.status = "approved";
      plan.approvedAt = new Date().toISOString();
      state.audit.unshift({
        at: plan.approvedAt,
        type: "plan_approved",
        detail: plan.siteName,
      });
      await saveState(state);
      return json(res, 200, { plan, state });
    }
    if (req.method === "POST" && url.pathname === "/api/photo") {
      const state = await getState();
      const { siteId, image, note = "" } = await body(req);
      const site = state.sites.find((s) => s.id === siteId);
      if (!site || !String(image).startsWith("data:image/"))
        return json(res, 400, { error: "A valid site and image are required" });
      const analysis = await analyzePhotoWithModel(image, note);
      site.photo = {
        image,
        note,
        capturedAt: new Date().toISOString(),
        ...analysis,
      };
      site.setting = analysis.setting;
      const event = createEvent(state, "photo_analyzed", {
        siteId,
        setting: analysis.setting,
      });
      const decisions = await processEvent(state, event);
      await saveState(state);
      return json(res, 200, { site, decisions, state });
    }
    if (req.method === "POST" && url.pathname === "/api/property/assess") {
      const state = await getState();
      const input = await body(req);
      const { site, assessment } = await assessProperty(state, input);
      const event = createEvent(state, "property_imagery_assessed", {
        siteId: site.id,
        location: site.propertyLocation,
        setting: assessment.setting,
      });
      const decisions = await processEvent(state, event);
      await saveState(state);
      return json(res, 201, { site, assessment, decisions, state });
    }
    if (req.method === "POST" && url.pathname === "/api/property/preview") {
      const input = await body(req);
      const state = await getState(input.profile);
      const templates = seedState().sites;
      const template =
        state.sites.find(
          (entry) => entry.id === input.siteId && entry.isTemplate,
        ) ||
        templates.find((entry) => entry.id === input.siteId) ||
        templates[0];
      if (!template)
        return json(res, 404, { error: "Site template not found" });
      const site = {
        ...template,
        id: `object_${crypto.randomUUID().slice(0, 8)}`,
        isTemplate: false,
        name: String(input.objectName || "New worksite").trim(),
        task: "Environmental assessment",
        setting: "uncertain",
        forecast: { ...template.forecast },
      };
      state.sites.push(site);
      await refreshForecast(site);
      const { assessment } = await assessProperty(state, {
        ...input,
        siteId: site.id,
      });
      return json(res, 200, {
        draft: {
          siteId: site.id,
          site: {
            id: site.id,
            name: site.name,
            task: site.task,
            shift: site.shift,
            latitude: site.latitude,
            longitude: site.longitude,
            equipment: site.equipment,
          },
          objectName: site.propertyObjectName,
          location: site.propertyLocation,
          photos: site.propertyPhotos,
          assessment,
          forecast: site.forecast,
          exposure: calculateEnvironmentalExposure(site),
        },
      });
    }
    if (req.method === "POST" && url.pathname === "/api/property/confirm") {
      const input = await body(req);
      const { store, team } = await teamFor(input.profile);
      if (!team) throw new Error("Create a crew before saving site evidence");
      const state = await getState(input.profile);
      hydrateTeamOperations(state, team);
      const draft = input.draft;
      if (!draft?.site || !draft?.assessment || !draft?.forecast)
        return json(res, 400, {
          error: "A completed object analysis is required",
        });
      let site = state.sites.find((entry) => entry.id === draft.site.id);
      if (!site) {
        site = {
          ...draft.site,
          id: String(draft.site.id),
          name: String(draft.site.name || draft.objectName || "New worksite"),
          isTemplate: false,
          setting: "uncertain",
          forecast: {},
        };
        state.sites.push(site);
      }
      const setting = settingFactors[draft.assessment.setting]
        ? draft.assessment.setting
        : "uncertain";
      site.propertyObjectName = String(draft.objectName || site.name);
      site.propertyLocation = String(draft.location || site.name);
      site.propertyPhotos = Array.isArray(draft.photos) ? draft.photos : [];
      site.forecast = draft.forecast;
      site.setting = setting;
      site.propertyAssessment = {
        ...draft.assessment,
        setting,
        exposure: calculateEnvironmentalExposure(site),
        assessedAt: new Date().toISOString(),
      };
      const event = createEvent(state, "property_imagery_assessed", {
        siteId: site.id,
        location: site.propertyLocation,
        setting,
      });
      const decisions = await processEvent(state, event);
      persistTeamOperations(state, team);
      await saveState(state, { persistOperations: false });
      await saveWorkerStore(store);
      return json(res, 201, { site, decisions, state });
    }
    const deletePropertyMatch = url.pathname.match(
      /^\/api\/property\/([^/]+)\/delete$/,
    );
    if (req.method === "POST" && deletePropertyMatch) {
      const input = await body(req);
      const siteId = decodeURIComponent(deletePropertyMatch[1]);
      const { store, team } = await teamFor(input.profile);
      if (!team) throw new Error("Team profile not found");
      const state = await getState(input.profile);
      hydrateTeamOperations(state, team);
      const site = state.sites.find((entry) => entry.id === siteId);
      if (!site || site.isTemplate)
        return json(res, 404, { error: "Saved object assessment not found" });
      state.sites = state.sites.filter((entry) => entry.id !== siteId);
      state.events = (state.events || []).filter(
        (event) => event.payload?.siteId !== siteId,
      );
      state.decisions = (state.decisions || []).filter(
        (decision) => decision.siteId !== siteId,
      );
      state.plans = (state.plans || []).filter(
        (plan) => plan.siteId !== siteId,
      );
      state.photoAudits = (state.photoAudits || []).filter(
        (audit) => audit.siteId !== siteId,
      );
      state.portfolio = buildPortfolio(state);
      persistTeamOperations(state, team);
      await saveState(state, { persistOperations: false });
      await saveWorkerStore(store);
      return json(res, 200, { state });
    }
    if (req.method === "POST" && url.pathname === "/api/photo-audit") {
      const state = await getState();
      const input = await body(req);
      const { site, audit } = await auditWorksitePhoto(state, input);
      const event = createEvent(state, "photo_analyzed", {
        siteId: site.id,
        auditId: audit.id,
      });
      const decisions = await processEvent(state, event);
      recordActivity(
        state,
        "evidence",
        `Photo audit completed for ${site.name}.`,
        `${audit.source}: ${audit.uvReflectivityRisk}`,
      );
      await saveState(state);
      return json(res, 201, { audit, decisions, state });
    }
    if (req.method === "POST" && url.pathname === "/api/team-member") {
      const input = await body(req);
      const { store, team } = await teamFor(input.profile, true);
      const state = await getState(input.profile);
      hydrateTeamOperations(state, team);
      const worker = addTeamMember(state, input);
      team.employees = state.workers;
      const event = createEvent(state, "team_member_added", {
        workerId: worker.id,
        siteId: worker.siteId,
      });
      event.status = "processed";
      state.portfolio = buildPortfolio(state);
      persistTeamOperations(state, team);
      await saveState(state, { persistOperations: false });
      await saveWorkerStore(store);
      return json(res, 201, { worker, state });
    }
    const teamMemberMatch = url.pathname.match(/^\/api\/team-member\/([^/]+)$/);
    if (req.method === "POST" && teamMemberMatch) {
      const input = await body(req);
      const { store, team } = await teamFor(input.profile);
      if (!team) throw new Error("Team profile not found");
      const state = await getState(input.profile);
      hydrateTeamOperations(state, team);
      const worker = updateTeamMember(state, teamMemberMatch[1], input);
      team.employees = state.workers;
      state.portfolio = buildPortfolio(state);
      persistTeamOperations(state, team);
      await saveState(state, { persistOperations: false });
      await saveWorkerStore(store);
      return json(res, 200, { worker, state });
    }
    const deleteTeamMemberMatch = url.pathname.match(
      /^\/api\/team-member\/([^/]+)\/delete$/,
    );
    if (req.method === "POST" && deleteTeamMemberMatch) {
      const input = await body(req);
      const { store, team } = await teamFor(input.profile);
      if (!team) throw new Error("Team profile not found");
      const state = await getState(input.profile);
      hydrateTeamOperations(state, team);
      removeTeamMember(state, deleteTeamMemberMatch[1]);
      team.employees = state.workers;
      state.portfolio = buildPortfolio(state);
      persistTeamOperations(state, team);
      await saveState(state, { persistOperations: false });
      await saveWorkerStore(store);
      return json(res, 200, { state });
    }
    if (
      req.method === "POST" &&
      url.pathname === "/api/behavioral-factors/preview"
    ) {
      const input = await body(req);
      const state = await getState(input.profile);
      return json(res, 200, { preview: protectionPreview(state, input) });
    }
    if (req.method === "POST" && url.pathname === "/api/behavioral-factors") {
      const input = await body(req);
      const { store, team } = await teamFor(input.profile);
      if (!team) throw new Error("Team profile not found");
      const state = await getState(input.profile);
      hydrateTeamOperations(state, team);
      const worker = updateBehavioralFactors(state, input);
      team.employees = state.workers;
      const event = createEvent(state, "behavioral_factors_updated", {
        workerId: worker.id,
        siteId: worker.siteId,
      });
      const decisions = await processEvent(state, event);
      persistTeamOperations(state, team);
      await saveState(state, { persistOperations: false });
      await saveWorkerStore(store);
      return json(res, 201, { worker, decisions, state });
    }
    if (req.method === "POST" && url.pathname === "/api/shift/approve") {
      const input = await body(req);
      const { store, team } = await teamFor(input.profile);
      if (!team) throw new Error("Team profile not found");

      const state = await getState(input.profile);
      hydrateTeamOperations(state, team);
      const plan = state.plans.find((entry) => entry.id === input.planId);
      if (!plan) return json(res, 404, { error: "Plan not found" });

      const approvedAt = new Date().toISOString();
      plan.status = "approved";
      plan.approvedAt = approvedAt;

      const matchingDecision = state.decisions.find(
        (decision) => decision.planId === plan.id,
      );
      if (matchingDecision) {
        matchingDecision.status = "approved";
        matchingDecision.approvedAt = approvedAt;
      }

      state.audit.unshift({
        at: approvedAt,
        type: "plan_approved",
        detail: plan.siteName || "Morning Brief",
      });
      recordActivity(
        state,
        "decision",
        "Morning plan approved...",
        `${plan.siteName || "The affected site"} rotation plan is approved and scheduled for crew check-in.`,
      );
      state.portfolio = buildPortfolio(state);
      persistTeamOperations(state, team);
      await saveState(state, { persistOperations: false });
      await saveWorkerStore(store);
      return json(res, 200, { plan, state });
    }
    if (req.method === "POST" && url.pathname === "/api/what-if") {
      const state = await getState();
      const { question } = await body(req);
      return json(res, 200, { result: simulateWhatIf(state, question) });
    }
    if (req.method === "POST" && url.pathname === "/api/roster/import") {
      const state = await getState();
      const { csv } = await body(req);
      const workers = parseRosterCsv(csv, state);
      state.workers.push(...workers);
      const event = createEvent(state, "roster_imported", {
        count: workers.length,
      });
      event.status = "processed";
      state.portfolio = buildPortfolio(state);
      await saveState(state);
      return json(res, 201, { imported: workers.length, state });
    }
    if (req.method === "POST" && url.pathname === "/api/scenario") {
      const state = await getState();
      const input = await body(req);
      const allowed = new Set([
        "heat_wave",
        "worker_absent",
        "equipment_failed",
      ]);
      if (!allowed.has(input.type))
        return json(res, 400, { error: "Unsupported scenario" });
      const event = createEvent(state, input.type, input.payload || {});
      const decisions = await processEvent(state, event);
      await saveState(state);
      return json(res, 201, { event, decisions, state });
    }
    if (req.method === "POST" && url.pathname === "/api/reset") {
      const state = seedState();
      state.portfolio = buildPortfolio(state);
      await saveState(state);
      return json(res, 200, state);
    }
    if (req.method === "GET" && url.pathname === "/")
      return json(res, 200, {
        service: "Umbra API",
        ui: "Open http://localhost:3000 for the React application.",
      });
    if (req.method === "GET") return json(res, 404, { error: "Not found" });
    json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    json(res, 500, { error: error.message || "Unexpected error" });
  }
});

server.listen(port, () =>
  console.log(`Umbra is running at http://localhost:${port}`),
);
export { server, getState, validatePlan };
