import { setupInteractions } from "/app-interactions.js";
let state;
let shownDecisionId;
let currentMode = "shift";
const placements = new Map();
let teamProfileDirty = false;
let externalFactorsDirty = false;
let behavioralFactorsDirty = false;
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
const clock = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
function activeDecision() {
  return (
    state.decisions.find((item) => item.id === shownDecisionId) ||
    state.decisions[0]
  );
}
function render() {
  const decision = activeDecision();
  const topSite = state.portfolio[0];
  $("#siteCount").textContent = state.sites.length;
  $("#riskScore").textContent = topSite?.exposureScore ?? "—";
  $("#lastCycle").textContent = clock(state.agent?.lastCycleAt);
  $("#activeCount").textContent = state.decisions.filter(
    (item) => item.status !== "approved",
  ).length;
  $("#agentState").innerHTML =
    `<i></i><span>${esc(state.agent?.status === "monitoring" ? "Monitoring outdoor operations" : state.agent?.status || "Reasoning")}</span>`;
  $("#reasoningMode").textContent =
    state.agent?.mode || "Simulated reasoning for demo";
  $("#shiftDecisionStatus").textContent = state.decisions.length
    ? state.decisions[0].status === "approved"
      ? "DECISION UPDATED"
      : "AWAITING APPROVAL"
    : "MONITORING";
  if (decision) renderDecision(decision);
  else {
    $("#recommendationBody").innerHTML =
      '<p class="loading">Monitoring for new operational evidence...</p>';
  }
  $("#activityStream").innerHTML = (state.activity || [])
    .slice(0, 8)
    .map(
      (item) =>
        `<div class="activityItem ${item.phase}"><time>${clock(item.at)}</time><div><b>${esc(item.message)}</b><small>${esc(item.detail)}</small></div></div>`,
    )
    .join("");
  $("#portfolioList").innerHTML = state.portfolio
    .map(
      (site, index) =>
        `<button class="siteRow" data-site="${site.siteId}"><span class="rank">0${index + 1}</span><span><b>${esc(site.name)}</b><small>UVI ${site.uvi} · ${site.activeCrew} active crew · ${esc(site.setting)}</small></span><span class="siteRisk">${site.exposureScore}</span><span class="siteAction">${esc(site.recommendation)}</span></button>`,
    )
    .join("");
  if ($("#sitesPortfolioList"))
    $("#sitesPortfolioList").innerHTML = state.portfolio
      .map(
        (site, index) =>
          `<button class="siteRow" data-site="${site.siteId}"><span class="rank">0${index + 1}</span><span><b>${esc(site.name)}</b><small>UVI ${site.uvi} · ${site.activeCrew} active crew · ${esc(site.setting)}</small></span><span class="siteRisk">${site.exposureScore}</span><span class="siteAction">${esc(site.recommendation)}</span></button>`,
      )
      .join("");
  document.querySelectorAll(".siteRow").forEach(
    (row) =>
      (row.onclick = () => {
        shownDecisionId = state.decisions.find(
          (decision) => decision.siteId === row.dataset.site,
        )?.id;
        render();
      }),
  );
  [$("#propertySite")].forEach((select) => {
    const saved = select.value;
    select.innerHTML = `<option value="">Select job site</option>${state.sites.map((site) => `<option value="${site.id}">${esc(site.name)}</option>`).join("")}`;
    select.value = saved;
  });
  $("#teamSite").innerHTML =
    `<option value="">Assign job site</option>${state.sites.map((site) => `<option value="${site.id}">${esc(site.name)}</option>`).join("")}`;
  $("#teamProfileForm select[name='avatar']").innerHTML =
    '<option value="">Choose a crew figurine</option><option value="builder">Builder</option><option value="engineer">Engineer</option><option value="lead">Site lead</option><option value="spotter">Spotter</option><option value="operator">Operator</option><option value="rigger">Rigger</option>';
  $("#externalSite").innerHTML =
    `<option value="">Select job site</option>${state.sites.map((site) => `<option value="${site.id}">${esc(site.name)}</option>`).join("")}`;
  const behaviorWorker = $("#behaviorWorker");
  const selectedWorker = behaviorWorker.value;
  behaviorWorker.innerHTML = `<option value="">Select team member</option>${state.workers
    .filter((worker) => worker.status === "active")
    .map(
      (worker) =>
        `<option value="${worker.id}">${esc(worker.name)} · ${esc(state.sites.find((site) => site.id === worker.siteId)?.name || "Unassigned")}</option>`,
    )
    .join("")}`;
  behaviorWorker.value = selectedWorker;
  const incidentSite = $("#incidentSite");
  incidentSite.innerHTML = state.sites
    .map((site) => `<option value="${site.id}">${esc(site.name)}</option>`)
    .join("");
  $("#incidentStream").innerHTML = (state.activity || [])
    .slice(0, 12)
    .map(
      (item) =>
        `<div class="incidentItem"><time>${clock(item.at)}</time><span>${esc(item.message)}</span><small>${esc(item.detail)}</small></div>`,
    )
    .join("");
  renderFacility();
  renderShift();
  renderExternalFactors();
  renderVisualEvidence();
  renderBehavioralFactors();
}

function renderVisualEvidence() {
  const property = state.sites.find(
    (site) => site.propertyAssessment,
  )?.propertyAssessment;
  if (property?.visibleEvidence?.length) {
    $("#externalEvidenceResult").insertAdjacentHTML(
      "beforeend",
      `<p class="visibleEvidence"><b>Visible evidence</b>: ${esc(property.visibleEvidence.join(" · "))}</p>`,
    );
  }
  const audit = state.photoAudits?.[0];
  if (audit?.visibleEvidence?.length) {
    $("#auditResult").insertAdjacentHTML(
      "beforeend",
      `<p class="visibleEvidence"><b>Visible evidence</b>: ${esc(audit.visibleEvidence.join(" · "))}</p>`,
    );
  }
}

function renderBehavioralFactors() {
  const worker = state.workers.find(
    (entry) => entry.id === $("#behaviorWorker").value,
  );
  if (!worker?.behavioralFactors) return;
  const factors = worker.behavioralFactors;
  $("#behaviorUpf").value = factors.upf;
  $("#behaviorSpf").value = factors.spf;
  $("#behaviorSunscreenHours").value = factors.sunscreenHoursAgo;
  $("#behaviorShade").value = factors.shadeAvailability;
  $("#behavioralResult").innerHTML =
    `<p class="eyebrow">CURRENT PROTECTION EFFECT</p><h2>${esc(worker.name)}</h2><p>${esc(factors.upf)} PPE · ${esc(factors.spf)} sunscreen · ${esc(factors.shadeAvailability)} conditions.</p><p>${Number(factors.sunscreenHoursAgo) > 2 ? "Sunscreen is treated as expired for the current plan." : "Sunscreen timing is within the two-hour planning window."}</p>`;
}

function renderExternalFactors() {
  const assessment = state.sites
    .map((site) => ({ site, assessment: site.propertyAssessment }))
    .find((entry) => entry.assessment);
  if (!assessment) return;
  const { site } = assessment;
  $("#weatherResult").innerHTML =
    `<h2>UVI ${esc(site.forecast.uvi)} · ${esc(site.forecast.temperatureC)}C</h2><p>${esc(site.forecast.cloudCover)}% cloud cover · source: ${esc(site.forecast.source || "last known")}</p>`;
  $("#externalEvidenceResult").innerHTML =
    `<h2>${esc(site.name)} · ${esc(site.propertyAssessment.setting)} exposure</h2><p>${esc(site.propertyAssessment.summary)}</p><ul>${(site.propertyAssessment.factors || []).map((factor) => `<li>${esc(factor)}</li>`).join("")}</ul><small>Water feature: ${esc(site.propertyAssessment.waterFeature)} · confidence: ${esc(site.propertyAssessment.confidence)}</small>`;
}

function renderShift() {
  const topSite = state.portfolio[0];
  const decision = state.decisions[0];
  $("#shiftRisk").textContent = topSite?.exposureScore ?? "—";
  $("#shiftRiskText").textContent = topSite
    ? `${topSite.name} is the highest-risk active site.`
    : "No active site risk.";
  $("#shiftSummary").textContent =
    decision?.recommendation ||
    "No active rotation recommendation. Monitoring current conditions.";
  $("#crewTitle").textContent = topSite
    ? `${topSite.name} crew`
    : "Active crew";
  const crew = state.workers.filter((worker) => worker.status === "active");
  $("#crewCount").textContent = `${crew.length} active`;
  $("#crewList").innerHTML = crew
    .map((worker) => {
      const site = state.sites.find((entry) => entry.id === worker.siteId);
      const score = site
        ? Math.round(
            (site.forecast.uvi || 0) *
              (worker.tier === "high"
                ? 1.5
                : worker.tier === "elevated"
                  ? 1.25
                  : 1),
          )
        : 0;
      const needsBreak =
        decision?.siteId === worker.siteId &&
        decision?.recommendation?.includes(worker.name);
      const location = needsBreak
        ? "Need a break"
        : site?.setting === "shaded"
          ? "In the shade"
          : "In the sun";
      const avatar = esc(worker.exposureProfile?.avatar || "builder");
      return `<div class="crewRow"><span class="crewInitial figurine ${avatar}"><i></i><em></em></span><span><b>${esc(worker.name)}</b><small>${esc(worker.role)} · ${esc(site?.name || "Unassigned")}</small></span><span class="crewStatus ${needsBreak ? "break" : location.includes("shade") ? "shade" : "sun"}">${location}</span><span class="crewScore">${score}</span></div>`;
    })
    .join("");
  $("#auditSite").innerHTML = state.sites
    .map((site) => `<option value="${site.id}">${esc(site.name)}</option>`)
    .join("");
  const audit = state.photoAudits?.[0];
  if (audit)
    $("#auditResult").innerHTML =
      `<p class="auditSource">${esc(audit.source)} · ${esc(audit.confidence)} confidence</p><b>${esc(audit.surfaceType)} — ${esc(audit.estimatedAlbedo)} albedo</b><p>${esc(audit.uvReflectivityRisk)}</p><ul><li>Hard hats: ${esc(audit.equipment?.hardHats)}</li><li>Protective clothing: ${esc(audit.equipment?.protectiveClothing)}</li><li>Goggles: ${esc(audit.equipment?.goggles)}</li></ul>`;
}
function renderDecision(decision) {
  const evidenceAgent = decision.evidenceAgent;
  $("#missionTitle").textContent = decision.recommendation;
  $("#missionSub").textContent =
    `${decision.siteName} is the highest current operational priority.`;
  $("#confidence").textContent = decision.confidence;
  $("#recommendationBody").innerHTML =
    `<p class="priorityLabel">${esc(decision.siteName)} · priority worker</p><h2 class="priorityRecommendation">${esc(decision.recommendation)}</h2><p class="priorityScore">Exposure score <b>${esc(decision.severity)}</b></p><dl class="decisionFacts"><div><dt>Triggering event</dt><dd>${esc(decision.triggeringEvent)}</dd></div><div><dt>Why now</dt><dd>${esc(decision.whyNow)}</dd></div><div><dt>Evidence used</dt><dd>${esc((evidenceAgent?.evidence || decision.reasoningChain).slice(0, 3).join(" · "))}</dd></div><div><dt>Operational tradeoff</dt><dd>${esc(decision.operationalImpact)}</dd></div><div><dt>Alternative action</dt><dd>${esc(evidenceAgent?.alternative?.decision || decision.alternative)}</dd></div><div><dt>Confidence</dt><dd>${esc(decision.confidence)}</dd></div></dl>`;
  $("#reasoningBody").innerHTML =
    `<section><p class="label">EVIDENCE</p><ul>${(evidenceAgent?.evidence || decision.reasoningChain).map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section><section><p class="label">REASONING</p><p>${esc((evidenceAgent?.reasoning || [decision.whyWorker, decision.whyNow]).join(" "))}</p></section><section><p class="label">TRADEOFF</p><p>${esc((evidenceAgent?.tradeoffs || [decision.operationalImpact]).join(" "))}</p><p>${esc(evidenceAgent?.alternative?.decision || decision.alternative)}</p></section><section class="final"><p class="label">DECISION</p><strong>${esc(decision.recommendation)}</strong><span>${esc(evidenceAgent?.source || "Validated operations engine")} · Supervisor approval required.</span></section>`;
  $("#reasoningBody").innerHTML = renderDecisionPresentation(decision);
  const button = $("#approve");
  button.hidden = decision.status === "approved";
  button.onclick = () => approve(decision.planId);
}
function renderDecisionPresentation(decision) {
  const agent = decision.evidenceAgent;
  const evidence = agent?.evidence || decision.reasoningChain || [];
  const reasoning = agent?.reasoning || [decision.whyWorker, decision.whyNow];
  const tradeoffs = agent?.tradeoffs || [decision.operationalImpact];
  return `<div class="decisionPresentation"><section class="decisionSection evidence"><p class="label">EVIDENCE</p><ul>${evidence.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><small>Confidence: ${esc(decision.confidence)}${agent?.uncertainty?.length ? ` · Uncertainty: ${esc(agent.uncertainty.join(" "))}` : ""}</small></section><section class="decisionSection"><p class="label">REASONING</p><p>${esc(reasoning.join(" "))}</p></section><section class="decisionSection"><p class="label">TRADEOFFS</p><ul>${tradeoffs.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><p>${esc(agent?.alternative?.decision || decision.alternative)}</p></section><section class="decisionSection final"><p class="label">DECISION</p><strong>${esc(decision.recommendation)}</strong><span>Validated exposure engine · Supervisor approval required.</span></section></div>`;
}
async function approve(planId) {
  const data = await request("/api/approve", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
  state = data.state;
  render();
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
$("#propertyForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const files = [...$("#propertyPhotos").files];
    const angle =
      $("#propertyAngles").value || "Supervisor supplied property angle";
    const photos = await Promise.all(
      files.map(async (file, index) => ({
        image: await readFile(file),
        angle: `${angle} ${index + 1}`,
      })),
    );
    const data = await request("/api/property/assess", {
      method: "POST",
      body: JSON.stringify({
        siteId: $("#propertySite").value,
        location: $("#propertyLocation").value,
        photos,
      }),
    });
    state = data.state;
    render();
    event.target.reset();
  } catch (error) {
    alert(error.message);
  }
};
$("#copilotForm").onsubmit = async (event) => {
  event.preventDefault();
  const question = $("#copilotInput").value.trim();
  if (!question) return;
  try {
    const { result } = await request("/api/what-if", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    $("#copilotAnswer").innerHTML =
      `<b>${esc(result.proposal)}</b><p>Exposure score: ${esc(result.baseline.exposureScore)} → ${esc(result.changed.exposureScore)}. Estimated reduction: ${esc(result.riskReductionPercent)}%.</p><p>${esc(result.coverageImpact)}</p><small>${esc(result.bestAlternative)} · Supervisor review required.</small>`;
  } catch (error) {
    $("#copilotAnswer").innerHTML =
      `<b>Scenario needs more detail.</b><p>${esc(error.message)}</p><small>Try: “What if Maya moves under a canopy?”</small>`;
  }
};
async function sync() {
  if (
    currentMode === "team" ||
    currentMode === "external" ||
    teamProfileDirty ||
    externalFactorsDirty ||
    behavioralFactorsDirty ||
    document.activeElement?.closest("#teamProfileForm")
  )
    return;
  try {
    const next = await request("/api/state");
    const changed = next.activity?.[0]?.id !== state?.activity?.[0]?.id;
    state = next;
    if (changed || !shownDecisionId) render();
  } catch {}
}

function switchMode(mode) {
  currentMode = mode;
  const viewMode = mode === "planning" ? "workspace" : mode;
  $("#teamMode").hidden = viewMode !== "team";
  $("#briefMode").hidden = viewMode !== "shift";
  $("#externalMode").hidden = viewMode !== "external";
  $("#behavioralMode").hidden = viewMode !== "behavioral";
  $("#incidentMode").hidden = viewMode !== "incident";
  $("#sitesMode").hidden = viewMode !== "sites";
  $("#reportsMode").hidden = viewMode !== "reports";
  $("#workspaceMode").hidden = viewMode !== "workspace";
  document
    .querySelectorAll(".modeNav button")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.mode === mode),
    );
  if (viewMode === "workspace") renderFacility();
}

function facilitySite() {
  return (
    state.sites.find((site) => site.propertyPhotos?.length) || state.sites[0]
  );
}
function renderFacility() {
  const site = facilitySite();
  const map = $("#facilityMap");
  if (!site?.propertyPhotos?.length) {
    map.innerHTML =
      '<div class="mapEmpty">Upload property imagery to create a site map.</div>';
    return;
  }
  const hour = Number($("#sunTime").value);
  const angle = 25 + ((hour - 6) / 12) * 130;
  const image = site.propertyPhotos[0];
  $("#mapTitle").textContent = `${site.name} placement preview`;
  map.innerHTML = `<img src="${image.image}" alt="${esc(image.angle)}" /><div class="sunVector" style="--sun:${angle}deg"></div><div class="shadeZone" style="--sun:${angle}deg"></div><div class="mapCaption">${esc(site.name)} · ${esc(image.angle)} · ${esc(site.propertyAssessment?.summary || "Property evidence pending")}</div>`;
  state.workers
    .filter((worker) => worker.siteId === site.id && worker.status === "active")
    .forEach((worker, index) => {
      const p = placements.get(worker.id) || { x: 25 + index * 18, y: 66 };
      const icon = document.createElement("button");
      icon.className = "mapWorker";
      icon.style.left = `${p.x}%`;
      icon.style.top = `${p.y}%`;
      icon.innerHTML = `<span>◆</span>${esc(worker.name.split(" ")[0])}`;
      icon.onpointerdown = (event) => dragWorker(event, icon, worker, site);
      map.append(icon);
    });
  assessPlacement(site);
}
function dragWorker(event, icon, worker, site) {
  icon.setPointerCapture(event.pointerId);
  icon.onpointermove = (move) => {
    const rect = $("#facilityMap").getBoundingClientRect();
    const x = Math.max(
      4,
      Math.min(94, ((move.clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.max(
      10,
      Math.min(86, ((move.clientY - rect.top) / rect.height) * 100),
    );
    placements.set(worker.id, { x, y });
    icon.style.left = `${x}%`;
    icon.style.top = `${y}%`;
    assessPlacement(site);
  };
  icon.onpointerup = () => {
    icon.onpointermove = null;
    icon.onpointerup = null;
  };
}
function assessPlacement(site) {
  const boundary = 38 + Math.abs(Number($("#sunTime").value) - 12) * 3;
  const exposed = state.workers
    .filter((worker) => worker.siteId === site.id && worker.status === "active")
    .filter((worker) => (placements.get(worker.id)?.x ?? 50) > boundary);
  const high = exposed.filter(
    (worker) =>
      worker.tier === "high" ||
      worker.exposureProfile?.photosensitivity === "high",
  );
  const output = $("#placementRisk");
  output.textContent = high.length
    ? `${high.map((worker) => worker.name).join(", ")} is placed in an approximate direct-exposure area.`
    : exposed.length
      ? `${exposed.length} crew member(s) are in an approximate direct-exposure area.`
      : "Crew is within the approximate shade zone.";
  output.className = `mapRisk ${exposed.length ? "risk" : "safe"}`;
}

await setupInteractions({
  get state() {
    return state;
  },
  set state(value) {
    state = value;
  },
  get shownDecisionId() {
    return shownDecisionId;
  },
  set shownDecisionId(value) {
    shownDecisionId = value;
  },
  $,
  request,
  readFile,
  render,
  renderFacility,
  renderBehavioralFactors,
  switchMode,
  sync,
});
