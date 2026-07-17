import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
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
  addTeamMember,
  decisionFromPlan,
  auditWorksitePhoto,
  recordActivity,
  getModelStatus,
  testModelConnection,
  updateBehavioralFactors,
} from "./src/planner.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const storeDir = join(root, "data");
const storePath = join(storeDir, "umbra.json");
const port = Number(process.env.PORT || 3000);

async function getState() {
  const state = existsSync(storePath)
    ? JSON.parse(await readFile(storePath, "utf8"))
    : seedState();
  state.events ||= [];
  state.decisions ||= [];
  state.activity ||= [];
  state.photoAudits ||= [];
  state.agent ||= {
    status: "monitoring",
    lastCycleAt: null,
    simulationIndex: 0,
    mode: process.env.OPENAI_API_KEY
      ? "GPT-5.6 reasoning active"
      : "Simulated reasoning for demo",
  };
  state.portfolio = buildPortfolio(state);
  return state;
}
async function saveState(state) {
  await mkdir(storeDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(state, null, 2));
}
function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 6_000_000) throw new Error("Payload too large");
  }
  return raw ? JSON.parse(raw) : {};
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/state")
      return json(res, 200, await getState());
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
      const state = await getState();
      const input = await body(req);
      const worker = addTeamMember(state, input);
      const event = createEvent(state, "team_member_added", {
        workerId: worker.id,
        siteId: worker.siteId,
      });
      event.status = "processed";
      state.portfolio = buildPortfolio(state);
      await saveState(state);
      return json(res, 201, { worker, state });
    }
    if (req.method === "POST" && url.pathname === "/api/behavioral-factors") {
      const state = await getState();
      const worker = updateBehavioralFactors(state, await body(req));
      const event = createEvent(state, "behavioral_factors_updated", {
        workerId: worker.id,
        siteId: worker.siteId,
      });
      const decisions = await processEvent(state, event);
      await saveState(state);
      return json(res, 201, { worker, decisions, state });
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
    if (req.method === "GET") {
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const safe = join(publicDir, path);
      if (!safe.startsWith(publicDir) || !existsSync(safe))
        return json(res, 404, { error: "Not found" });
      res.writeHead(200, {
        "content-type": mime[extname(safe)] || "application/octet-stream",
      });
      return res.end(await readFile(safe));
    }
    json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    json(res, 500, { error: error.message || "Unexpected error" });
  }
});

server.listen(port, () =>
  console.log(`Umbra is running at http://localhost:${port}`),
);
export { server, getState, validatePlan };
