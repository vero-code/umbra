import {
  buildEvidenceAgentMock,
  buildEvidencePacket,
  evidenceAgentDecision,
} from "./planner-evidence.mjs";

export const riskTiers = { standard: 1, elevated: 1.25, high: 1.5 };
export const sensitivityFactors = { low: 1, moderate: 1.15, high: 1.3 };
export const upfFactors = { cotton: 0.95, visor: 0.82, upf50: 0.55 };
export const spfFactors = { none: 1, spf30: 0.82, spf50: 0.7 };
export const shadeFactors = { direct: 1, partial: 0.76, canopy: 0.58 };
export const settingFactors = {
  shaded: 0.85,
  mixed: 1.1,
  open: 1.2,
  reflective: 2,
  uncertain: 1.25,
};
export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

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
          localHour: 12,
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
          localHour: 12,
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
          localHour: 12,
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

export function calculateEnvironmentalExposure(site) {
  const forecast = site.forecast || {};
  const hour = Number.isFinite(Number(forecast.localHour))
    ? Number(forecast.localHour)
    : new Date().getHours();
  const sunAltitudeFactor =
    hour >= 11 && hour < 16 ? 1.35 : hour >= 9 && hour < 17 ? 1.08 : 0.65;
  const cloudCover = Math.max(
    0,
    Math.min(100, Number(forecast.cloudCover) || 0),
  );
  // UVI already incorporates observed sky conditions. This modest modifier makes
  // cloud context visible without treating the weather-provider UVI as cloud-free.
  const cloudFactor =
    cloudCover >= 70
      ? Math.max(0.3, 1 - cloudCover / 100)
      : cloudCover >= 20
        ? 1.08
        : 1;
  const albedoFactor = settingFactors[site.setting || "uncertain"];
  const baseUvi = Math.max(0, Number(forecast.uvi) || 0);
  const doseIndex =
    Math.round(baseUvi * sunAltitudeFactor * cloudFactor * albedoFactor * 10) /
    10;
  return {
    baseUvi,
    hour,
    cloudCover,
    sunAltitudeFactor,
    cloudFactor,
    albedoFactor,
    doseIndex,
  };
}

export function scoreWorker(site, worker) {
  const environment = calculateEnvironmentalExposure(site);
  const behavior = worker.behavioralFactors || {};
  const sunscreenExpired = Number(behavior.sunscreenHoursAgo) > 2;
  const protectionFactor =
    (upfFactors[behavior.upf] || 1) *
    (sunscreenExpired ? 1 : spfFactors[behavior.spf] || 1) *
    (shadeFactors[behavior.shadeAvailability] || 1);
  const heat =
    site.forecast.temperatureC >= 34
      ? 1.35
      : site.forecast.temperatureC >= 29
        ? 1.15
        : 1;
  const equipmentFactor = site.equipment === "failed" ? 1.15 : 1;
  return (
    Math.round(
      environment.doseIndex *
        heat *
        equipmentFactor *
        riskTiers[worker.tier] *
        (sensitivityFactors[worker.exposureProfile?.photosensitivity] || 1) *
        protectionFactor *
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
  const environment = calculateEnvironmentalExposure(site);
  const basis = [
    `UV index is ${environment.baseUvi}; it is converted to a planning dose index of ${environment.doseIndex}.`,
    `Sun altitude/time modifier is ${environment.sunAltitudeFactor}x at ${String(environment.hour).padStart(2, "0")}:00; the 11:00–16:00 peak window receives the highest modifier.`,
    `Cloud cover is ${environment.cloudCover}%, applying a ${environment.cloudFactor}x sky-condition modifier.`,
    `Surface setting is ${site.setting}, applying an albedo/reflectivity modifier of ${environment.albedoFactor}x.`,
    `Temperature is ${site.forecast.temperatureC}C, applying the heat load modifier.`,
    `${ranked[0].name} has the highest calculated exposure score (${ranked[0].score}) after their ${ranked[0].tier} priority tier.`,
    ranked[0].exposureProfile
      ? `Worker risk profile: ${ranked[0].name} reports ${ranked[0].exposureProfile.photosensitivity || "unrecorded"} photosensitivity and Fitzpatrick type ${ranked[0].exposureProfile.fitzpatrickType || "unrecorded"}.`
      : `Worker risk profile: ${ranked[0].name}'s operational tier is ${ranked[0].tier}; no additional self-reported profile is recorded.`,
    `Crew availability: ${ranked.length} active worker(s) are assigned to this site; break rotations preserve coverage.`,
  ];
  const factors = ranked[0].behavioralFactors;
  if (factors) {
    basis.push(
      `${ranked[0].name}'s protection profile applies ${factors.upf || "unrecorded"} PPE, ${factors.spf || "no"} sunscreen, and ${factors.shadeAvailability || "unrecorded"} shade conditions.`,
    );
    if (Number(factors.sunscreenHoursAgo) > 2)
      basis.push(
        "The recorded sunscreen application is over two hours old, so no current sunscreen reduction is applied.",
      );
  } else {
    basis.push(
      `${ranked[0].name}'s PPE, sunscreen timing, and shade status are unrecorded; no protection reduction is assumed.`,
    );
  }
  if (site.propertyAssessment?.uncertainty?.length)
    basis.push(`Uncertainty: ${site.propertyAssessment.uncertainty.join(" ")}`);
  else if (site.propertyAssessment?.confidence === "unavailable")
    basis.push("Uncertainty: live site imagery analysis is unavailable.");
  if (site.photo)
    basis.push(
      `Latest site photo classified the work environment as ${site.photo.setting} (${site.photo.confidence} confidence).`,
    );
  else if (site.propertyAssessment)
    basis.push(
      `Site imagery assessment: ${site.propertyAssessment.setting || site.setting} (${site.propertyAssessment.confidence || "unavailable"} confidence).`,
    );
  else basis.push("Site imagery: no property photo assessment is available.");
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
    environmentalExposure: calculateEnvironmentalExposure(site),
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
    evidenceAgent: plan.evidenceAgent,
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
  const evidencePacket = buildEvidencePacket(site, plan, workers, event);
  plan.evidenceAgent = buildEvidenceAgentMock(evidencePacket);
  if (useModel && process.env.OPENAI_API_KEY) {
    try {
      plan.evidenceAgent = await evidenceAgentDecision(
        state,
        site,
        evidencePacket,
      );
      plan.source = "GPT-5.6 + validated operations engine";
    } catch {
      plan.evidenceAgent = buildEvidenceAgentMock(evidencePacket, true);
    }
  }
  return plan;
}
