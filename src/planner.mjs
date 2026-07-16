const riskTiers = { standard: 1, elevated: 1.25, high: 1.5 };
const sensitivityFactors = { low: 1, moderate: 1.15, high: 1.3 };
const settingFactors = {
  shaded: 1,
  mixed: 1.2,
  open: 1.4,
  reflective: 1.55,
  uncertain: 1.3,
};
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export function seedState() {
  return {
    sites: [
      {
        id: "site_north",
        name: "North Tower Roof",
        task: "HVAC installation",
        shift: "07:00-15:00",
        latitude: 40.7128,
        longitude: -74.006,
        setting: "reflective",
        equipment: "ready",
        forecast: {
          uvi: 9,
          temperatureC: 31,
          cloudCover: 15,
          source: "baseline",
        },
        photo: null,
      },
      {
        id: "site_river",
        name: "Riverfront Facade",
        task: "Exterior cladding",
        shift: "07:00-15:00",
        latitude: 40.706,
        longitude: -74.01,
        setting: "mixed",
        equipment: "ready",
        forecast: {
          uvi: 7,
          temperatureC: 28,
          cloudCover: 35,
          source: "baseline",
        },
        photo: null,
      },
      {
        id: "site_west",
        name: "West Yard",
        task: "Material staging",
        shift: "06:30-14:30",
        latitude: 40.728,
        longitude: -74.02,
        setting: "open",
        equipment: "ready",
        forecast: {
          uvi: 6,
          temperatureC: 27,
          cloudCover: 42,
          source: "baseline",
        },
        photo: null,
      },
    ],
    workers: [
      {
        id: "w1",
        name: "Maya Chen",
        siteId: "site_north",
        role: "Lead installer",
        tier: "high",
        status: "active",
      },
      {
        id: "w2",
        name: "Jon Bell",
        siteId: "site_north",
        role: "Installer",
        tier: "standard",
        status: "active",
      },
      {
        id: "w3",
        name: "Ari Patel",
        siteId: "site_north",
        role: "Electrician",
        tier: "elevated",
        status: "active",
      },
      {
        id: "w4",
        name: "Nia Ross",
        siteId: "site_river",
        role: "Cladding lead",
        tier: "elevated",
        status: "active",
      },
      {
        id: "w5",
        name: "Leo Martin",
        siteId: "site_river",
        role: "Installer",
        tier: "standard",
        status: "active",
      },
      {
        id: "w6",
        name: "Inez Park",
        siteId: "site_west",
        role: "Yard lead",
        tier: "standard",
        status: "active",
      },
      {
        id: "w7",
        name: "Sam Okafor",
        siteId: "site_west",
        role: "Operator",
        tier: "elevated",
        status: "active",
      },
    ],
    events: [],
    decisions: [],
    plans: [],
    audit: [],
    portfolio: [],
    agent: {
      status: "monitoring",
      lastCycleAt: null,
      simulationIndex: 0,
      mode: process.env.OPENAI_API_KEY
        ? "GPT-5.6 reasoning active"
        : "Simulated reasoning for demo",
    },
    activity: [
      {
        id: id("activity"),
        at: now(),
        phase: "monitoring",
        message: "Umbra is monitoring outdoor operations.",
        detail: "Local simulated evidence stream is active.",
      },
    ],
  };
}

export function recordActivity(state, phase, message, detail = "") {
  state.activity ||= [];
  state.activity.unshift({
    id: id("activity"),
    at: now(),
    phase,
    message,
    detail,
  });
  state.activity = state.activity.slice(0, 30);
}

export function scoreWorker(site, worker) {
  const heat =
    site.forecast.temperatureC >= 34
      ? 1.35
      : site.forecast.temperatureC >= 29
        ? 1.15
        : 1;
  const equipmentFactor = site.equipment === "failed" ? 1.15 : 1;
  return (
    Math.round(
      site.forecast.uvi *
        heat *
        equipmentFactor *
        settingFactors[site.setting || "uncertain"] *
        riskTiers[worker.tier] *
        (sensitivityFactors[worker.exposureProfile?.photosensitivity] || 1) *
        10,
    ) / 10
  );
}

function rotations(workers, equipment) {
  const blocks = ["09:30-09:50", "11:15-11:35", "13:00-13:20"];
  const maxOut =
    equipment === "failed" ? 1 : Math.max(1, Math.floor(workers.length / 2));
  return blocks.map((window, index) => ({
    window,
    breakMinutes: 20,
    workers: workers
      .slice(index % workers.length, (index % workers.length) + maxOut)
      .map((w) => w.id),
  }));
}

export function validatePlan(plan, workers) {
  if (!workers.length)
    return { valid: false, reason: "No active workers assigned" };
  if (!plan.rotationBlocks.length || !plan.priorityWorkers.length)
    return { valid: false, reason: "Missing rotations or priority order" };
  const active = new Set(workers.map((w) => w.id));
  for (const block of plan.rotationBlocks) {
    if (
      block.breakMinutes < 15 ||
      block.workers.some((workerId) => !active.has(workerId))
    )
      return { valid: false, reason: "Invalid break block" };
    if (block.workers.length >= workers.length)
      return {
        valid: false,
        reason: "Cannot rotate the entire crew out at once",
      };
  }
  return { valid: true };
}

function buildDecisionBasis(site, ranked, event) {
  const basis = [
    `UV index is ${site.forecast.uvi}; the site exposure setting is ${site.setting}.`,
    `Temperature is ${site.forecast.temperatureC}C, applying the heat load modifier.`,
    `${ranked[0].name} has the highest calculated exposure score (${ranked[0].score}) after their ${ranked[0].tier} priority tier.`,
  ];
  if (site.photo)
    basis.push(
      `Latest site photo classified the work environment as ${site.photo.setting} (${site.photo.confidence} confidence).`,
    );
  if (site.equipment === "failed")
    basis.push(
      "Equipment failure reduces rotation capacity, so only one worker rotates at a time.",
    );
  if (event)
    basis.unshift(
      `Triggered automatically by ${event.type.replaceAll("_", " ")}.`,
    );
  return basis;
}

function rulePlan(site, workers, event) {
  const ranked = workers
    .map((worker) => ({ ...worker, score: scoreWorker(site, worker) }))
    .sort((a, b) => b.score - a.score);
  const plan = {
    id: id("plan"),
    createdAt: now(),
    siteId: site.id,
    siteName: site.name,
    status:
      ranked[0].score >= 15 || site.equipment === "failed"
        ? "needs_review"
        : "approved_candidate",
    source: "validated operations engine",
    triggerEventId: event?.id || null,
    priorityWorkers: ranked.map(
      ({ id: workerId, name, role, tier, score }) => ({
        id: workerId,
        name,
        role,
        tier,
        score,
      }),
    ),
    rotationBlocks: rotations(ranked, site.equipment),
    alerts: [],
    reasoningChain: buildDecisionBasis(site, ranked, event),
    confidence:
      site.photo?.confidence === "unavailable"
        ? "Moderate - simulated imagery assessment"
        : "High",
  };
  if (site.forecast.uvi >= 8)
    plan.alerts.push(
      `Very high UV index (${site.forecast.uvi}) requires earlier relief.`,
    );
  if (site.forecast.temperatureC >= 30)
    plan.alerts.push(
      `Heat load is elevated at ${site.forecast.temperatureC}C.`,
    );
  if (site.setting === "reflective")
    plan.alerts.push("Reflective surface exposure is elevated.");
  if (site.equipment === "failed")
    plan.alerts.push("Equipment failure constrains crew coverage.");
  const checked = validatePlan(plan, workers);
  if (!checked.valid) throw new Error(checked.reason);
  return plan;
}

export function decisionFromPlan(plan, event) {
  const first = plan.priorityWorkers[0];
  const alternative = plan.priorityWorkers[1] || first;
  return {
    id: id("dec"),
    createdAt: now(),
    eventId: event?.id || null,
    siteId: plan.siteId,
    siteName: plan.siteName,
    severity: first.score,
    recommendation: `${first.name} should come out of the sun first.`,
    triggeringEvent:
      event?.type?.replaceAll("_", " ") || "Continuous portfolio monitoring",
    whatChanged: event
      ? `New ${event.type.replaceAll("_", " ")} evidence changed site priority.`
      : "Portfolio priority was refreshed.",
    whyWorker: `${first.name} has the highest exposure score (${first.score}) after risk tier, site conditions, and coverage constraints.`,
    whyNow:
      plan.alerts[0] ||
      "Exposure conditions require a current rotation decision.",
    operationalImpact: `Expected exposure reduction: ${Math.min(28, Math.round(first.score * 1.35))}%. Estimated work delay: 20 minutes.`,
    alternative: `Alternative: rotate ${alternative.name} first for an estimated ${Math.min(20, Math.round(alternative.score * 1.1))}% reduction, with lower risk relief.`,
    confidence: plan.confidence,
    reasoningChain: plan.reasoningChain,
    planId: plan.id,
    status: plan.status,
  };
}

export async function createPlan(
  state,
  siteId,
  { event = null, useModel = true } = {},
) {
  const site = state.sites.find((entry) => entry.id === siteId);
  if (!site) throw new Error("Site not found");
  const workers = state.workers.filter(
    (worker) => worker.siteId === siteId && worker.status === "active",
  );
  const plan = rulePlan(site, workers, event);
  if (useModel && process.env.OPENAI_API_KEY) {
    try {
      plan.agentExplanation = await modelRationale(site, plan);
      plan.source = "GPT-5.6 + validated operations engine";
    } catch {
      plan.agentExplanation = {
        summary:
          "Model explanation unavailable; deterministic decision basis remains active.",
      };
    }
  }
  return plan;
}

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
  recordActivity(
    state,
    "incoming",
    `Incoming ${signal.type.replaceAll("_", " ")}...`,
    "Simulated operational evidence received.",
  );
  recordActivity(
    state,
    "reasoning",
    "Analyzing evidence and comparing crew allocations...",
    state.agent.mode,
  );
  const event = createEvent(state, signal.type, signal.payload);
  const decisions = await processEvent(state, event);
  recordActivity(
    state,
    "decision",
    "Decision updated. Supervisor notification prepared.",
    decisions[0]?.recommendation || "Portfolio continues monitoring.",
  );
  state.agent.status = "monitoring";
  state.agent.lastCycleAt = now();
  state.agent.simulationIndex += 1;
  return { event, decisions };
}

export function buildPortfolio(state) {
  return state.sites
    .map((site) => {
      const active = state.workers.filter(
        (worker) => worker.siteId === site.id && worker.status === "active",
      );
      const latest = state.decisions.find(
        (decision) => decision.siteId === site.id,
      );
      return {
        siteId: site.id,
        name: site.name,
        activeCrew: active.length,
        exposureScore: active.length
          ? Math.max(...active.map((worker) => scoreWorker(site, worker)))
          : 99,
        recommendation: latest?.recommendation || "Monitoring conditions",
        status: latest?.status || "monitoring",
        setting: site.setting,
        uvi: site.forecast.uvi,
      };
    })
    .sort((a, b) => b.exposureScore - a.exposureScore);
}

export async function refreshForecast(site) {
  const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
  endpoint.search = new URLSearchParams({
    latitude: site.latitude,
    longitude: site.longitude,
    hourly: "uv_index,temperature_2m,cloud_cover",
    forecast_days: "1",
    timezone: "auto",
  });
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) throw new Error("Weather provider unavailable");
    const data = await response.json();
    const index = new Date().getHours();
    site.forecast = {
      uvi:
        Math.round((data.hourly.uv_index[index] ?? site.forecast.uvi) * 10) /
        10,
      temperatureC: Math.round(
        data.hourly.temperature_2m[index] ?? site.forecast.temperatureC,
      ),
      cloudCover: Math.round(
        data.hourly.cloud_cover[index] ?? site.forecast.cloudCover,
      ),
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
  const required = [
    "name",
    "siteId",
    "role",
    "tier",
    "photosensitivity",
    "outdoorHistory",
  ];
  if (required.some((key) => !String(input[key] || "").trim()))
    throw new Error(
      "Name, site, role, priority tier, photosensitivity, and outdoor history are required",
    );
  if (!state.sites.some((site) => site.id === input.siteId))
    throw new Error("Selected site does not exist");
  if (!riskTiers[input.tier] || !sensitivityFactors[input.photosensitivity])
    throw new Error("Invalid exposure profile");
  const worker = {
    id: id("worker"),
    name: input.name.trim(),
    siteId: input.siteId,
    role: input.role.trim(),
    tier: input.tier,
    status: "active",
    exposureProfile: {
      photosensitivity: input.photosensitivity,
      outdoorHistory: input.outdoorHistory,
      accommodationNote: String(input.accommodationNote || "").trim() || null,
      photo: input.photo || null,
    },
  };
  state.workers.push(worker);
  return worker;
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
    input.location || site.name,
  );
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

async function callOpenAI(input) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6",
      reasoning: { effort: "low" },
      input,
      text: { format: { type: "json_object" } },
    }),
  });
  if (!response.ok) throw new Error("OpenAI request failed");
  const data = await response.json();
  return JSON.parse(data.output_text);
}
async function modelRationale(site, plan) {
  const context = {
    site: {
      name: site.name,
      task: site.task,
      forecast: site.forecast,
      setting: site.setting,
    },
    priorityWorkers: plan.priorityWorkers,
    decisionBasis: plan.reasoningChain,
    instruction:
      "Return JSON {summary, operational_considerations:string[]}. Explain only supplied operational factors; do not provide medical advice.",
  };
  return callOpenAI([
    {
      role: "user",
      content: [
        { type: "input_text", text: JSON.stringify(context) },
        ...(site.photo?.image
          ? [
              {
                type: "input_image",
                image_url: site.photo.image,
                detail: "low",
              },
            ]
          : []),
      ],
    },
  ]);
}
export async function analyzePhotoWithModel(image, note) {
  if (!process.env.OPENAI_API_KEY)
    return {
      setting: "uncertain",
      confidence: "unavailable",
      summary:
        "Vision analysis is unavailable until GPT-5.6 credentials are configured.",
    };
  try {
    const result = await callOpenAI([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Assess outdoor worksite exposure. Note: ${note}. Return JSON {setting, confidence, summary, factors:string[]}; setting must be shaded, mixed, open, reflective, or uncertain. Do not infer health conditions.`,
          },
          { type: "input_image", image_url: image, detail: "low" },
        ],
      },
    ]);
    return {
      setting: settingFactors[result.setting] ? result.setting : "uncertain",
      confidence: result.confidence || "low",
      summary: result.summary || "Photo reviewed.",
      factors: result.factors || [],
    };
  } catch {
    return {
      setting: "uncertain",
      confidence: "low",
      summary:
        "Vision analysis failed; conservative uncertain setting applied.",
    };
  }
}

async function analyzePropertyWithModel(photos, location) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      setting: "uncertain",
      confidence: "unavailable",
      summary:
        "Property imagery is stored, but GPT-5.6 vision is unavailable until credentials are configured.",
      factors: [
        "No vision classification was produced. A conservative uncertain exposure setting is active.",
      ],
      waterFeature: "unknown",
      reflectiveMaterials: [],
      shadeObservations: [],
    };
  }
  const content = [
    {
      type: "input_text",
      text: `You are assessing outdoor worksite exposure for operational planning. Location provided by supervisor: ${location}. Review all supplied property angles. Return JSON {setting, confidence, summary, factors:string[], waterFeature:"present"|"not_observed"|"uncertain", reflectiveMaterials:string[], shadeObservations:string[]}. setting must be shaded, mixed, open, reflective, or uncertain. Only state visually supported environmental observations such as fresh concrete, glass, water, metal, tree cover, or shade. Do not infer people traits or provide medical advice.`,
    },
    ...photos.map((photo) => ({
      type: "input_image",
      image_url: photo.image,
      detail: "low",
    })),
  ];
  try {
    const result = await callOpenAI([{ role: "user", content }]);
    return {
      setting: settingFactors[result.setting] ? result.setting : "uncertain",
      confidence: result.confidence || "low",
      summary: result.summary || "Property reviewed.",
      factors: result.factors || [],
      waterFeature: ["present", "not_observed", "uncertain"].includes(
        result.waterFeature,
      )
        ? result.waterFeature
        : "uncertain",
      reflectiveMaterials: result.reflectiveMaterials || [],
      shadeObservations: result.shadeObservations || [],
    };
  } catch {
    return {
      setting: "uncertain",
      confidence: "low",
      summary:
        "Property vision assessment failed; a conservative setting is active.",
      factors: ["Analysis unavailable; supervisor review required."],
      waterFeature: "uncertain",
      reflectiveMaterials: [],
      shadeObservations: [],
    };
  }
}

async function analyzeAuditWithModel(image, prompt) {
  if (!process.env.OPENAI_API_KEY)
    return {
      source: "simulated",
      setting: "uncertain",
      confidence: "unavailable",
      surfaceType: "Unverified",
      estimatedAlbedo: "Unknown",
      uvReflectivityRisk: "Review required",
      equipment: {
        hardHats: "not assessed",
        protectiveClothing: "not assessed",
        goggles: "not assessed",
      },
      findings: [
        "Vision is unavailable. This demo result does not represent a real photo assessment.",
      ],
      recommendedPrompt:
        "Inspect hard hats, long sleeves, UV-rated eye protection, shade access, and the surface material before work starts.",
    };
  try {
    const result = await callOpenAI([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Audit this outdoor worksite photo for operational UV exposure. Supervisor context: ${prompt}. Return JSON {setting,confidence,surfaceType,estimatedAlbedo,uvReflectivityRisk,equipment:{hardHats,protectiveClothing,goggles},findings:string[],recommendedPrompt}. setting must be shaded, mixed, open, reflective, or uncertain. estimatedAlbedo must be a qualitative band only: low, moderate, high, or unknown. Only assess clearly visible surfaces and protective equipment; do not identify people or infer health conditions.`,
          },
          { type: "input_image", image_url: image, detail: "low" },
        ],
      },
    ]);
    return {
      source: "GPT-5.6 Vision",
      setting: settingFactors[result.setting] ? result.setting : "uncertain",
      confidence: result.confidence || "low",
      surfaceType: result.surfaceType || "Unverified",
      estimatedAlbedo: result.estimatedAlbedo || "unknown",
      uvReflectivityRisk: result.uvReflectivityRisk || "Review required",
      equipment: result.equipment || {
        hardHats: "unknown",
        protectiveClothing: "unknown",
        goggles: "unknown",
      },
      findings: result.findings || [],
      recommendedPrompt:
        result.recommendedPrompt ||
        "Confirm surface and PPE conditions with the foreman.",
    };
  } catch {
    return {
      source: "simulated",
      setting: "uncertain",
      confidence: "low",
      surfaceType: "Unverified",
      estimatedAlbedo: "Unknown",
      uvReflectivityRisk: "Review required",
      equipment: {
        hardHats: "not assessed",
        protectiveClothing: "not assessed",
        goggles: "not assessed",
      },
      findings: [
        "Vision request failed; no image-derived conclusion was applied.",
      ],
      recommendedPrompt: "Perform a manual site and PPE check.",
    };
  }
}
