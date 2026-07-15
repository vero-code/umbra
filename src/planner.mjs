const riskTiers = { standard: 1, elevated: 1.25, high: 1.5 };
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
        shift: "07:00–15:00",
        latitude: 40.7128,
        longitude: -74.006,
        setting: "reflective",
        forecast: { uvi: 9, temperatureC: 31, cloudCover: 15, source: "demo" },
        photo: null,
      },
      {
        id: "site_river",
        name: "Riverfront Façade",
        task: "Exterior cladding",
        shift: "07:00–15:00",
        latitude: 40.706,
        longitude: -74.01,
        setting: "mixed",
        forecast: { uvi: 7, temperatureC: 28, cloudCover: 35, source: "demo" },
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
      },
      {
        id: "w2",
        name: "Jon Bell",
        siteId: "site_north",
        role: "Installer",
        tier: "standard",
      },
      {
        id: "w3",
        name: "Ari Patel",
        siteId: "site_north",
        role: "Electrician",
        tier: "elevated",
      },
      {
        id: "w4",
        name: "Nia Ross",
        siteId: "site_river",
        role: "Cladding lead",
        tier: "elevated",
      },
      {
        id: "w5",
        name: "Leo Martin",
        siteId: "site_river",
        role: "Installer",
        tier: "standard",
      },
    ],
    plans: [],
    audit: [],
  };
}
export function scoreWorker(site, worker) {
  const heat =
    site.forecast.temperatureC >= 32
      ? 1.3
      : site.forecast.temperatureC >= 28
        ? 1.15
        : 1;
  return (
    Math.round(
      site.forecast.uvi *
        heat *
        settingFactors[site.setting || "uncertain"] *
        riskTiers[worker.tier] *
        10,
    ) / 10
  );
}
export async function refreshForecast(site) {
  // Open-Meteo needs no credential; if unavailable, keep last-known conditions.
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
function rotations(workers) {
  const blocks = ["09:30–09:50", "11:15–11:35", "13:00–13:20"];
  return blocks.map((window, index) => ({
    window,
    breakMinutes: 20,
    workers: workers
      .slice(
        index % 2,
        (index % 2) + Math.max(1, Math.ceil(workers.length / 2)),
      )
      .map((w) => w.id),
  }));
}
export function validatePlan(plan, workers) {
  if (!plan.rotationBlocks.length || !plan.priorityWorkers.length)
    return { valid: false, reason: "Missing rotations or priority order" };
  const active = new Set(workers.map((w) => w.id));
  for (const block of plan.rotationBlocks) {
    if (block.breakMinutes < 15 || block.workers.some((id) => !active.has(id)))
      return { valid: false, reason: "Invalid break block" };
    if (block.workers.length >= workers.length)
      return {
        valid: false,
        reason: "Cannot rotate the entire crew out at once",
      };
  }
  return { valid: true };
}
function rulePlan(site, workers, trigger = null) {
  const ranked = workers
    .map((w) => ({ ...w, score: scoreWorker(site, w) }))
    .sort((a, b) => b.score - a.score);
  const plan = {
    id: id("plan"),
    createdAt: now(),
    siteId: site.id,
    siteName: site.name,
    status: ranked[0].score >= 15 ? "needs_review" : "approved_candidate",
    source: process.env.OPENAI_API_KEY ? "rules_fallback" : "rules_demo",
    trigger,
    priorityWorkers: ranked.map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role,
      tier: w.tier,
      score: w.score,
    })),
    rotationBlocks: rotations(ranked),
    alerts: [],
    rationale: [],
  };
  if (site.forecast.uvi >= 8)
    plan.alerts.push(`Very high UV index (${site.forecast.uvi}) expected.`);
  if (site.forecast.temperatureC >= 30)
    plan.alerts.push(
      `Heat load is elevated at ${site.forecast.temperatureC}°C.`,
    );
  if (site.setting === "reflective")
    plan.alerts.push(
      "Reflective surfaces amplify exposure; use shade and eye protection.",
    );
  plan.rationale = [
    `${ranked[0].name} is first out because their exposure score is highest (${ranked[0].score}).`,
    "Rotations preserve on-site coverage; supervisor approval is required before use.",
  ];
  const checked = validatePlan(plan, workers);
  if (!checked.valid) throw new Error(checked.reason);
  return plan;
}
export async function createPlan(state, siteId, { useModel = true } = {}) {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site) throw new Error("Site not found");
  const workers = state.workers.filter((w) => w.siteId === siteId);
  const baseline = rulePlan(site, workers);
  // The deterministic plan is the authority for safety constraints. Model output may only enrich rationale.
  if (useModel && process.env.OPENAI_API_KEY) {
    try {
      baseline.modelRationale = await modelRationale(site, baseline);
      baseline.source = "gpt-5.6 + validated rules";
    } catch {
      /* retain validated plan */
    }
  }
  return baseline;
}
export async function replan(state, siteId, trigger) {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site) throw new Error("Site not found");
  if (/heat|uv/i.test(trigger)) {
    site.forecast.uvi = Math.min(11, site.forecast.uvi + 2);
    site.forecast.temperatureC += 2;
  }
  return createPlan(state, siteId, { useModel: true }).then((p) => ({
    ...p,
    trigger,
  }));
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
  const payload = {
    site: {
      name: site.name,
      task: site.task,
      setting: site.setting,
      forecast: site.forecast,
    },
    priority: plan.priorityWorkers,
    constraints:
      "Do not give medical advice. Explain operational factors only. Return JSON {summary, considerations:string[]}.",
    photoIncluded: Boolean(site.photo?.image),
  };
  const result = await callOpenAI([
    {
      role: "user",
      content: [
        { type: "input_text", text: JSON.stringify(payload) },
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
  return result;
}
export async function analyzePhotoWithModel(image, note) {
  if (!process.env.OPENAI_API_KEY)
    return {
      setting: "reflective",
      confidence: "demo",
      summary:
        "Demo classification: bright, open work surface with likely reflected exposure.",
    };
  try {
    const result = await callOpenAI([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Classify this worksite as one of shaded, mixed, open, reflective, uncertain. Note: ${note}. Return JSON {setting, confidence, summary}. Do not infer health conditions.`,
          },
          { type: "input_image", image_url: image, detail: "low" },
        ],
      },
    ]);
    return {
      setting: settingFactors[result.setting] ? result.setting : "uncertain",
      confidence: result.confidence || "low",
      summary: result.summary || "Photo reviewed.",
    };
  } catch {
    return {
      setting: "uncertain",
      confidence: "low",
      summary: "Photo analysis unavailable; supervisor review required.",
    };
  }
}
