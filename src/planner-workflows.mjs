import {
  id,
  now,
  riskTiers,
  sensitivityFactors,
  settingFactors,
  upfFactors,
  spfFactors,
  shadeFactors,
  scoreWorker,
  recordActivity,
  createPlan,
  decisionFromPlan,
} from "./planner-core.mjs";
import {
  analyzeAuditWithModel,
  analyzePropertyWithModel,
} from "./planner-vision.mjs";

const operationalMessages = {
  conditions_updated: "Incoming weather update...",
  cloud_clearing: "UV forecast changed...",
  heat_advisory: "Incoming NOAA Heat Advisory...",
  heat_wave: "Incoming heat-wave advisory...",
  photo_analyzed: "Reflective surface detected...",
  property_imagery_assessed: "New site imagery received...",
  behavioral_factors_updated: "Worker protection status updated...",
  worker_absent: "Worker absence reported...",
  equipment_failed: "Equipment failure reported...",
  manual_review_requested: "Supervisor scenario requested...",
};

export function createEvent(state, type, payload = {}) {
  const event = {
    id: id("evt"),
    type,
    payload,
    occurredAt: now(),
    status: "received",
  };
  state.events.unshift(event);
  state.audit.unshift({
    at: event.occurredAt,
    type: "event_received",
    detail: type.replaceAll("_", " "),
  });
  recordActivity(
    state,
    "incoming",
    operationalMessages[type] || "Incoming operational evidence...",
    "Evidence received; Umbra will replan only if the operating picture changes.",
  );
  return event;
}

export async function processEvent(state, event) {
  const affected = new Set();
  if (event.type === "conditions_updated") affected.add(event.payload.siteId);
  if (event.type === "cloud_clearing") {
    const site = state.sites.find((entry) => entry.id === event.payload.siteId);
    if (site) {
      site.forecast.cloudCover = Math.max(0, site.forecast.cloudCover - 30);
      site.forecast.uvi = Math.min(11, site.forecast.uvi + 1);
      affected.add(site.id);
    }
  }
  if (event.type === "photo_analyzed") affected.add(event.payload.siteId);
  if (event.type === "property_imagery_assessed")
    affected.add(event.payload.siteId);
  if (event.type === "worker_absent") {
    const worker = state.workers.find(
      (entry) => entry.id === event.payload.workerId,
    );
    if (worker) {
      worker.status = "absent";
      affected.add(worker.siteId);
    }
  }
  if (event.type === "behavioral_factors_updated") {
    const worker = state.workers.find(
      (entry) => entry.id === event.payload.workerId,
    );
    if (worker) affected.add(worker.siteId);
  }
  if (event.type === "equipment_failed") {
    const site = state.sites.find((entry) => entry.id === event.payload.siteId);
    if (site) {
      site.equipment = "failed";
      affected.add(site.id);
    }
  }
  if (event.type === "heat_wave" || event.type === "heat_advisory") {
    state.sites.forEach((site) => {
      site.forecast.uvi = Math.min(11, site.forecast.uvi + 2);
      site.forecast.temperatureC += 4;
      affected.add(site.id);
    });
  }
  if (affected.size)
    recordActivity(
      state,
      "reasoning",
      "Comparing crew allocations...",
      "Evaluating worker risk, protection status, site exposure, and current crew assignments.",
    );
  const decisions = [];
  for (const siteId of affected) {
    try {
      const plan = await createPlan(state, siteId, { event });
      state.plans.unshift(plan);
      const decision = decisionFromPlan(plan, event);
      state.decisions.unshift(decision);
      decisions.push(decision);
    } catch (error) {
      state.decisions.unshift({
        id: id("dec"),
        createdAt: now(),
        eventId: event.id,
        siteId,
        severity: 99,
        recommendation: "Supervisor intervention required.",
        reasoningChain: [error.message],
        status: "needs_review",
      });
    }
  }
  event.status = "processed";
  event.processedAt = now();
  if (decisions.length)
    recordActivity(
      state,
      "decision",
      "Recommendation updated...",
      "Supervisor approval requested. Deterministic exposure constraints remain authoritative.",
    );
  else
    recordActivity(
      state,
      "monitoring",
      "Evidence logged; plan unchanged.",
      "No site exposure or crew constraint changed, so no replanning was triggered.",
    );
  state.portfolio = buildPortfolio(state);
  return decisions;
}

export async function runAutonomousCycle(state) {
  state.agent ||= {
    simulationIndex: 0,
    mode: process.env.OPENAI_API_KEY
      ? "GPT-5.6 reasoning active"
      : "Simulated reasoning for demo",
  };
  const available = state.workers.filter(
    (worker) => worker.status === "active",
  );
  const sequence = [
    { type: "heat_advisory", payload: {} },
    { type: "cloud_clearing", payload: { siteId: "site_north" } },
    {
      type: "worker_absent",
      payload: {
        workerId: available.find((worker) => worker.siteId === "site_river")
          ?.id,
      },
    },
    { type: "equipment_failed", payload: { siteId: "site_west" } },
  ].filter(
    (item) =>
      item.payload.workerId !== undefined || item.type !== "worker_absent",
  );
  const signal = sequence[state.agent.simulationIndex % sequence.length];
  const event = createEvent(state, signal.type, signal.payload);
  const decisions = await processEvent(state, event);
  state.agent.status = "monitoring";
  state.agent.lastCycleAt = now();
  state.agent.simulationIndex += 1;
  return { event, decisions };
}

export function buildPortfolio(state) {
  const ranked = state.sites
    .map((site) => {
      const active = state.workers.filter(
        (worker) => worker.siteId === site.id && worker.status === "active",
      );
      const latest = state.decisions.find(
        (decision) => decision.siteId === site.id,
      );
      const hasActiveCrew = active.length > 0;
      return {
        siteId: site.id,
        name: site.name,
        activeCrew: active.length,
        exposureScore: hasActiveCrew
          ? Math.max(...active.map((worker) => scoreWorker(site, worker)))
          : 0,
        recommendation: hasActiveCrew
          ? latest?.recommendation || "Monitoring conditions"
          : "No active crew assigned",
        status: hasActiveCrew ? latest?.status || "monitoring" : "monitoring",
        setting: site.setting,
        uvi: site.forecast.uvi,
        temperatureC: site.forecast.temperatureC,
        cloudCover: site.forecast.cloudCover,
        confidence:
          latest?.confidence ||
          site.propertyAssessment?.confidence ||
          "moderate",
        lastUpdate:
          latest?.createdAt || site.propertyAssessment?.updatedAt || null,
        priorityReason: hasActiveCrew
          ? latest?.whyNow ||
            `UVI ${site.forecast.uvi}, ${site.setting} setting, and ${active.length} active worker(s) require monitoring.`
          : "No active crew is assigned; environmental conditions remain under monitoring.",
      };
    })
    .sort(
      (a, b) =>
        Number(b.activeCrew > 0) - Number(a.activeCrew > 0) ||
        b.exposureScore - a.exposureScore,
    );
  return ranked.map((site, index) => ({
    ...site,
    rank: index + 1,
    rankReason:
      index === 0
        ? `Highest current priority: ${site.name} — ${site.priorityReason}`
        : `${index === 1 ? "Second" : "Third"} priority because ${site.priorityReason}`,
  }));
}

export async function refreshForecast(site) {
  const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
  endpoint.search = new URLSearchParams({
    latitude: site.latitude,
    longitude: site.longitude,
    current: "uv_index,temperature_2m,cloud_cover",
    forecast_days: "1",
    timezone: "auto",
  });
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) throw new Error("Weather provider unavailable");
    const data = await response.json();
    const current = data.current || {};
    const localHour = Number(String(current.time || "").slice(11, 13));
    site.forecast = {
      uvi: Math.round((current.uv_index ?? site.forecast.uvi) * 10) / 10,
      temperatureC: Math.round(
        current.temperature_2m ?? site.forecast.temperatureC,
      ),
      cloudCover: Math.round(current.cloud_cover ?? site.forecast.cloudCover),
      localHour: Number.isFinite(localHour)
        ? localHour
        : site.forecast.localHour,
      source: "open-meteo",
      refreshedAt: now(),
    };
    return { refreshed: true, forecast: site.forecast };
  } catch {
    return { refreshed: false, forecast: site.forecast };
  }
}

export function parseRosterCsv(csv, state) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2)
    throw new Error("CSV must include a header and at least one worker");
  const headers = lines
    .shift()
    .split(",")
    .map((entry) => entry.trim().toLowerCase());
  const required = ["name", "site", "role", "tier"];
  if (required.some((key) => !headers.includes(key)))
    throw new Error("CSV columns required: name, site, role, tier");
  const index = (key) => headers.indexOf(key);
  const sites = new Map(
    state.sites.map((site) => [site.name.toLowerCase(), site.id]),
  );
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",").map((entry) => entry.trim());
    const siteId =
      sites.get(cells[index("site")].toLowerCase()) || cells[index("site")];
    if (!state.sites.some((site) => site.id === siteId))
      throw new Error(`Unknown site: ${cells[index("site")]}`);
    const tier = cells[index("tier")].toLowerCase();
    if (!riskTiers[tier]) throw new Error(`Invalid tier: ${tier}`);
    return {
      id: id("worker"),
      name: cells[index("name")],
      siteId,
      role: cells[index("role")],
      tier,
      status: "active",
    };
  });
}

export function addTeamMember(state, input) {
  const required = ["name", "age", "photosensitivity"];
  if (required.some((key) => !String(input[key] || "").trim()))
    throw new Error("Name, age, and individual sensitivity are required");
  const siteId = state.sites.some((site) => site.id === input.siteId)
    ? input.siteId
    : state.sites[0]?.id;
  if (!siteId) throw new Error("Create a job site before adding a worker");
  const tier = riskTiers[input.tier]
    ? input.tier
    : input.photosensitivity === "high"
      ? "high"
      : input.photosensitivity === "moderate"
        ? "elevated"
        : "standard";
  if (!sensitivityFactors[input.photosensitivity])
    throw new Error("Invalid exposure profile");
  const age = Number(input.age);
  if (!Number.isInteger(age) || age < 18 || age > 100)
    throw new Error("Age must be a whole number from 18 to 100");
  const suppliedFitzpatrick = Number(input.fitzpatrickType);
  const fitzpatrickType =
    Number.isInteger(suppliedFitzpatrick) &&
    suppliedFitzpatrick >= 1 &&
    suppliedFitzpatrick <= 6
      ? suppliedFitzpatrick
      : null;
  const worker = {
    id: id("worker"),
    name: input.name.trim(),
    age,
    siteId,
    role: String(input.role || "field_worker").trim(),
    tier,
    status: "active",
    exposureProfile: {
      photosensitivity: input.photosensitivity,
      outdoorHistory: input.outdoorHistory || "unrecorded",
      accommodationNote: String(input.accommodationNote || "").trim() || null,
      avatar: input.avatar || "builder",
      medicalMarkers: String(input.medicalMarkers || "").trim() || null,
      fitzpatrickType,
      photosensitizingMedication: input.photosensitizingMedication === "yes",
      profileSignature: String(input.profileSignature || "").trim() || null,
      signedAt: input.profileSignature ? now() : null,
      requiresOccupationalHealthReview:
        age >= 60 ||
        input.photosensitizingMedication === "yes" ||
        Boolean(String(input.medicalMarkers || "").trim()),
    },
  };
  state.workers.push(worker);
  return worker;
}

export function updateTeamMember(state, workerId, input) {
  const worker = state.workers.find((entry) => entry.id === workerId);
  if (!worker) throw new Error("Team member not found");
  if (
    !["name", "age", "photosensitivity", "fitzpatrickType"].every((key) =>
      String(input[key] || "").trim(),
    )
  )
    throw new Error(
      "Name, age, individual sensitivity, and Fitzpatrick type are required",
    );
  const age = Number(input.age);
  const fitzpatrickType = Number(input.fitzpatrickType);
  if (!Number.isInteger(age) || age < 18 || age > 100)
    throw new Error("Age must be a whole number from 18 to 100");
  if (!sensitivityFactors[input.photosensitivity])
    throw new Error("Invalid individual sensitivity");
  if (
    !Number.isInteger(fitzpatrickType) ||
    fitzpatrickType < 1 ||
    fitzpatrickType > 6
  )
    throw new Error("Fitzpatrick type must be from 1 to 6");
  worker.name = String(input.name).trim();
  worker.age = age;
  worker.exposureProfile ||= {};
  worker.exposureProfile.photosensitivity = input.photosensitivity;
  worker.exposureProfile.fitzpatrickType = fitzpatrickType;
  worker.exposureProfile.medicalMarkers =
    String(input.medicalMarkers || "").trim() || null;
  worker.exposureProfile.profileSignature = "acknowledged";
  worker.exposureProfile.signedAt = now();
  worker.exposureProfile.requiresOccupationalHealthReview =
    age >= 60 || Boolean(worker.exposureProfile.medicalMarkers);
  return worker;
}

export function removeTeamMember(state, workerId) {
  const index = state.workers.findIndex((entry) => entry.id === workerId);
  if (index < 0) throw new Error("Team member not found");
  return state.workers.splice(index, 1)[0];
}

export function updateBehavioralFactors(state, input) {
  const worker = state.workers.find((entry) => entry.id === input.workerId);
  if (!worker) throw new Error("Team member not found");
  if (input.siteId) {
    const site = state.sites.find((entry) => entry.id === input.siteId);
    if (!site) throw new Error("Select an active worksite");
    worker.siteId = site.id;
  }
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
  if (!input.mapPosition)
    throw new Error(
      "Place the worker on the worksite image before rebuilding the plan",
    );
  const x = Number(input.mapPosition.x);
  const y = Number(input.mapPosition.y);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 100 ||
    y < 0 ||
    y > 100
  )
    throw new Error("Worker map position must stay within the worksite image");
  const mapPosition = {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    siteId: worker.siteId,
  };
  worker.behavioralFactors = {
    upf: input.upf,
    spf: input.spf,
    sunscreenHoursAgo,
    shadeAvailability: input.shadeAvailability,
    mapPosition,
    updatedAt: now(),
  };
  return worker;
}

export function simulateWhatIf(state, question) {
  const normalized = String(question || "")
    .trim()
    .toLowerCase();
  if (!normalized) throw new Error("Describe the proposed operational change");
  const worker = state.workers.find((entry) =>
    normalized.includes(entry.name.toLowerCase().split(" ")[0]),
  );
  if (!worker) throw new Error("Name a current team member in the scenario");
  const site = state.sites.find((entry) => entry.id === worker.siteId);
  if (!site) throw new Error("Worker is not assigned to an active site");
  const proposedShade = /canopy|consistent shade|full shade/.test(normalized)
    ? "canopy"
    : /partial shade|partial/.test(normalized)
      ? "partial"
      : /direct sun|roof|open sun/.test(normalized)
        ? "direct"
        : null;
  if (!proposedShade)
    throw new Error(
      "Specify direct sun, partial shade, or a canopy in the scenario",
    );
  const baselineRisk = scoreWorker(site, worker);
  const proposedWorker = {
    ...worker,
    behavioralFactors: {
      ...(worker.behavioralFactors || {}),
      shadeAvailability: proposedShade,
    },
  };
  const proposedRisk = scoreWorker(site, proposedWorker);
  const reduction = Math.max(
    0,
    Math.round(
      ((baselineRisk - proposedRisk) / Math.max(baselineRisk, 1)) * 100,
    ),
  );
  const alternative = state.workers
    .filter(
      (entry) =>
        entry.siteId === site.id &&
        entry.id !== worker.id &&
        entry.status === "active",
    )
    .map((entry) => ({ worker: entry, risk: scoreWorker(site, entry) }))
    .sort((a, b) => b.risk - a.risk)[0];
  return {
    source: "validated what-if planner",
    worker: { id: worker.id, name: worker.name, siteName: site.name },
    proposal: `Move ${worker.name} to ${proposedShade === "canopy" ? "a canopy / consistent shade" : proposedShade}.`,
    baseline: {
      exposureScore: baselineRisk,
      shadeAvailability:
        worker.behavioralFactors?.shadeAvailability || "unrecorded",
    },
    changed: { exposureScore: proposedRisk, shadeAvailability: proposedShade },
    riskReductionPercent: reduction,
    operationalDelay:
      proposedShade === "canopy"
        ? "Approximately 10–20 minutes to reposition and confirm coverage."
        : "No modeled delay; verify task coverage before applying.",
    confidence: "moderate",
    readOnly: true,
    whatChanged: `Only the proposed ${proposedShade} placement was simulated; the live roster and plan were not changed.`,
    coverageImpact:
      proposedShade === "canopy"
        ? "Crew count is unchanged; the worker must be assigned to a shaded task or relief position during the rotation."
        : "Crew count is unchanged; supervisor must confirm task-location coverage.",
    bestAlternative: alternative
      ? `Alternative: move ${alternative.worker.name} to a canopy first; their current exposure score is ${alternative.risk}.`
      : "No alternate active worker is available at this site.",
    supervisorReviewRequired: true,
  };
}

export async function assessProperty(state, input) {
  const site = state.sites.find((entry) => entry.id === input.siteId);
  if (!site) throw new Error("Site not found");
  const photos = Array.isArray(input.photos)
    ? input.photos.filter((photo) =>
        String(photo.image || "").startsWith("data:image/"),
      )
    : [];
  if (!photos.length)
    throw new Error("At least one property photo is required");
  const assessment = await analyzePropertyWithModel(
    photos,
    `${input.objectName || site.name}. ${input.location || site.name}. Supervisor notes: ${input.notes || "none"}`,
  );
  if (assessment.weatherScenario) {
    site.forecast = {
      ...site.forecast,
      ...assessment.weatherScenario,
      refreshedAt: now(),
    };
  }
  site.propertyObjectName = String(input.objectName || "").trim() || site.name;
  site.propertyLocation = String(input.location || "").trim() || site.name;
  site.propertyPhotos = photos.map((photo) => ({
    angle: String(photo.angle || "Unspecified angle"),
    image: photo.image,
    note: String(photo.note || ""),
    capturedAt: now(),
  }));
  site.propertyAssessment = { ...assessment, assessedAt: now() };
  site.setting = assessment.setting;
  return { site, assessment };
}

export async function auditWorksitePhoto(state, input) {
  const site = state.sites.find((entry) => entry.id === input.siteId);
  if (!site || !String(input.image || "").startsWith("data:image/"))
    throw new Error("A valid site and audit photo are required");
  const audit = await analyzeAuditWithModel(input.image, input.prompt || "");
  const record = {
    id: id("audit"),
    siteId: site.id,
    image: input.image,
    prompt: String(input.prompt || ""),
    ...audit,
    createdAt: now(),
  };
  state.photoAudits ||= [];
  state.photoAudits.unshift(record);
  if (audit.setting && settingFactors[audit.setting])
    site.setting = audit.setting;
  return { site, audit: record };
}
