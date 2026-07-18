import { setupInteractions } from "/app-interactions.js";
let state;
let shownDecisionId;
let currentMode = "shift";
const placements = new Map();
let teamProfileDirty = false;
let externalFactorsDirty = false;
let behavioralFactorsDirty = false;
let foremanProfile = JSON.parse(
  localStorage.getItem("umbra_foreman_profile") || "null",
);
const externalEvidenceKey = () =>
  `umbra_external_evidence_${foremanProfile?.company || ""}:${foremanProfile?.name || ""}`;
const lastModeKey = () =>
  `umbra_last_mode_${foremanProfile?.company || ""}:${foremanProfile?.name || ""}`;
const hasExternalEvidence = () =>
  localStorage.getItem(externalEvidenceKey()) === "true";
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
function renderPortfolioSite(site) {
  const risk =
    site.exposureScore >= 15
      ? "High"
      : site.exposureScore >= 10
        ? "Elevated"
        : "Moderate";
  return `<article class="portfolioSite"><header><span class="rank">0${site.rank}</span><div><h3>${esc(site.name)}</h3><p class="portfolioReason">${esc(site.rankReason)}</p></div><strong class="siteRisk">${esc(risk)} · ${site.exposureScore}</strong></header><div class="portfolioMetrics"><span><b>UV / heat</b>UVI ${esc(site.uvi)} · ${esc(site.temperatureC)}°C · ${esc(site.cloudCover)}% clouds</span><span><b>Exposure setting</b>${esc(site.setting)}</span><span><b>Crew</b>${esc(site.activeCrew)} active</span><span><b>Last update</b>${esc(clock(site.lastUpdate))}</span><span><b>Confidence</b>${esc(site.confidence)}</span></div><footer><b>Current recommendation</b><span>${esc(site.recommendation)}</span></footer></article>`;
}
function render() {
  applyForemanGate();
  const decision = activeDecision();
  const topSite = state.portfolio[0];
  $("#siteCount").textContent = state.sites.length;
  $("#riskScore").textContent = topSite?.exposureScore ?? "—";
  $("#lastCycle").textContent = clock(state.agent?.lastCycleAt);
  $("#activeCount").textContent = state.decisions.filter(
    (item) => item.status !== "approved",
  ).length;
  const agentState = $("#agentState");
  if (agentState) {
    agentState.innerHTML = `<i></i><span>${esc(state.agent?.status === "monitoring" ? "Monitoring outdoor operations" : state.agent?.status || "Reasoning")}</span>`;
  }
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
      .map(renderPortfolioSite)
      .join(""); /* portfolio */
  /* legacy compact portfolio remains on Shift */
  if (false)
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
  const teamSite = $("#teamSite");
  if (teamSite)
    teamSite.innerHTML = `<option value="">Assign job site</option>${state.sites.map((site) => `<option value="${site.id}">${esc(site.name)}</option>`).join("")}`;
  const teamAvatar = $("#teamProfileForm select[name='avatar']");
  if (teamAvatar)
    teamAvatar.innerHTML = '<option value="builder">Builder</option>';
  const externalSite = $("#externalSite");
  externalSite.innerHTML = state.sites
    .map((site) => `<option value="${site.id}">${esc(site.name)}</option>`)
    .join("");
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
  renderExternalAnalysisPanel();
  renderExternalTimeline();
  renderVisualEvidence();
  renderBehavioralFactors();
  renderReports();
}
function applyForemanGate() {
  const ready = Boolean(foremanProfile?.name && foremanProfile?.company);
  document.body.classList.toggle("needsForeman", !ready);
  $("#foremanOnboarding").hidden = ready;
  $("#foremanProfileMenu").hidden = !ready;
  $("#foremanActions").hidden = true;
  $("#foremanIdentity").setAttribute("aria-expanded", "false");
  $("#foremanName").textContent = ready ? foremanProfile.name : "";
  $("#foremanCompany").textContent = ready ? foremanProfile.company : "";
  document.querySelectorAll(".modeNav button").forEach((button) => {
    const hasEmployees = state?.workers?.length > 0;
    const available =
      ready &&
      (button.dataset.mode === "team" ||
        (hasEmployees && button.dataset.mode === "external"));
    button.disabled = !available;
    button.title = available
      ? ""
      : ready
        ? "Add an employee profile before continuing"
        : "Complete the foreman profile first";
  });
  updateModeSlider();
  if (!ready) {
    document
      .querySelectorAll(".modeView")
      .forEach((view) => (view.hidden = true));
  }
}

function updateModeSlider() {
  const hasEmployees = state?.workers?.length > 0;
  const ready = Boolean(foremanProfile?.name && foremanProfile?.company);
  const previous = $("#previousMode");
  const next = $("#nextMode");
  if (!previous || !next) return;
  previous.disabled = !ready || currentMode !== "external";
  next.disabled = !ready || !hasEmployees || currentMode !== "team";
  previous.title = previous.disabled
    ? "No previous available step"
    : "Back to Team";
  next.title = next.disabled
    ? hasEmployees
      ? "No next available step"
      : "Add an employee to unlock the next step"
    : "Continue to External Factors";
}

function renderReports() {
  const reports = $("#reportsContent");
  if (!reports) return;
  const exposureRows = state.portfolio
    .map(
      (site) =>
        `<li><b>${esc(site.name)}</b>: UVI ${esc(site.uvi)}, ${esc(site.temperatureC)}°C, ${esc(site.setting)} setting, exposure score ${esc(site.exposureScore)}.</li>`,
    )
    .join("");
  const breaks = state.workers
    .filter((worker) => worker.status === "active")
    .map(
      (worker) =>
        `<li>${esc(worker.name)} · next break ${state.decisions.find((decision) => decision.siteId === worker.siteId && decision.recommendation?.includes(worker.name)) ? "now" : "planned rotation"}</li>`,
    )
    .join("");
  const reminders =
    state.workers
      .filter(
        (worker) => Number(worker.behavioralFactors?.sunscreenHoursAgo) > 2,
      )
      .map(
        (worker) =>
          `<li>${esc(worker.name)}: SPF reminder due; last application is outside the two-hour planning window.</li>`,
      )
      .join("") || "<li>No expired SPF applications recorded.</li>";
  const evidence =
    state.sites
      .filter((site) => site.propertyAssessment)
      .map(
        (site) =>
          `<li>${esc(site.name)}: ${esc(site.propertyAssessment.summary)} · confidence ${esc(site.propertyAssessment.confidence)}</li>`,
      )
      .join("") || "<li>No site-photo assessments recorded.</li>";
  const approvals =
    state.audit
      .filter((item) => item.type === "plan_approved")
      .map((item) => `<li>${esc(item.at)} · Supervisor approval recorded.</li>`)
      .join("") || "<li>No approvals recorded.</li>";
  const exceptions =
    state.events
      .filter(
        (event) =>
          event.type === "worker_absent" ||
          event.type === "equipment_failed" ||
          event.type === "heat_advisory",
      )
      .map(
        (event) =>
          `<li>${esc(event.type.replaceAll("_", " "))} · ${esc(event.status)}</li>`,
      )
      .join("") || "<li>No exceptions recorded.</li>";
  const unresolved =
    state.decisions
      .filter((decision) => decision.status !== "approved")
      .map(
        (decision) =>
          `<li>${esc(decision.siteName || decision.siteId)}: ${esc(decision.recommendation)} · supervisor review pending.</li>`,
      )
      .join("") || "<li>No unresolved recommendations.</li>";
  reports.innerHTML = `<div class="reportSummary"><p class="eyebrow">EXPORT-READY SUMMARY</p><p>Operational record for HR and occupational safety review. Umbra reports observed conditions, actions, and approvals; it does not provide medical diagnoses or legal guarantees.</p></div><div class="reportGrid"><article><h3>Daily UV exposure log</h3><ul>${exposureRows}</ul></article><article><h3>Worker break history</h3><ul>${breaks || "<li>No active crew records.</li>"}</ul></article><article><h3>SPF reminder history</h3><ul>${reminders}</ul></article><article><h3>Site and weather evidence</h3><ul>${evidence}</ul></article><article><h3>Photo-analysis evidence</h3><ul>${(state.photoAudits || []).map((audit) => `<li>${esc(audit.surfaceType)} · ${esc(audit.estimatedAlbedo)} albedo · ${esc(audit.confidence)} confidence.</li>`).join("") || "<li>No photo audits recorded.</li>"}</ul></article><article><h3>Supervisor approvals</h3><ul>${approvals}</ul></article><article><h3>Exceptions</h3><ul>${exceptions}</ul></article><article><h3>Unresolved risks</h3><ul>${unresolved}</ul></article></div>`;
}

function renderVisualEvidence() {
  if (!hasExternalEvidence()) return;
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
  const hours = Number(factors.sunscreenHoursAgo || 0);
  const expired = hours > 2;
  const modifier =
    (expired ? 1.15 : 0.9) *
    (factors.shadeAvailability === "direct_sun" ? 1.2 : 0.75);
  const action = expired
    ? `Reapply ${factors.spf || "sunscreen"} before the next roof rotation.`
    : factors.shadeAvailability === "direct_sun"
      ? "Assign a shade break or rotate this worker at the next safe interval."
      : "Protection is currently within the recorded planning window.";
  $("#behavioralResult").innerHTML =
    `<p class="eyebrow">PROTECTION STATUS</p><h2>${esc(worker.name)}</h2><dl class="protectionChecklist"><div><dt>UPF / PPE</dt><dd>${esc(factors.upf || "Unrecorded")}</dd></div><div><dt>SPF level</dt><dd>${esc(factors.spf || "Unrecorded")}</dd></div><div><dt>Hours since application</dt><dd>${esc(hours)}</dd></div><div><dt>Shade assignment</dt><dd>${esc(factors.shadeAvailability || "Unrecorded")}</dd></div><div><dt>Expiration warning</dt><dd class="${expired ? "warning" : "ok"}">${expired ? "Expired for planning" : "Within two-hour window"}</dd></div><div><dt>Exposure modifier</dt><dd>${esc(modifier.toFixed(2))}x</dd></div></dl><p><b>Recommended action:</b> ${esc(action)}</p>`;
}

function renderExternalFactors() {
  if (!hasExternalEvidence()) {
    $("#weatherResult").innerHTML =
      "<h2>Analysis results will appear here</h2><p>Add an object name, location, and two photos, then run the assessment to view current weather, Vision findings, albedo, and the planning dose calculation.</p>";
    $("#externalEvidenceResult").innerHTML =
      "<p>Submitted object assessments are saved here for this crew, including visible materials, shade observations, albedo, and confidence.</p>";
    $("#externalEvidenceTimeline").innerHTML =
      '<p class="eyebrow">EVIDENCE TIMELINE</p><small>The saved history of object uploads, weather refreshes, and assessment updates will appear here.</small>';
    return;
  }
  const assessment = state.sites
    .map((site) => ({ site, assessment: site.propertyAssessment }))
    .find((entry) => entry.assessment) || {
    site: state.sites[0],
    assessment: null,
  };
  if (!assessment.site) return;
  const { site } = assessment;
  if (!assessment.assessment) {
    $("#weatherResult").innerHTML =
      `<h2>UVI ${esc(site.forecast.uvi)} · ${esc(site.forecast.temperatureC)}°C</h2><p>${esc(site.forecast.cloudCover)}% cloud cover · source: ${esc(site.forecast.source || "last known")}</p>`;
    $("#externalEvidenceResult").innerHTML =
      `<p>No object imagery assessment yet. Upload two angles to detect visible materials, shade, and albedo.</p>`;
    $("#externalEvidenceTimeline").innerHTML =
      `<p class="eyebrow">EVIDENCE TIMELINE</p><small>Waiting for incoming environmental evidence.</small>`;
    return;
  }
  $("#weatherResult").innerHTML =
    `<h2>UVI ${esc(site.forecast.uvi)} · ${esc(site.forecast.temperatureC)}C</h2><p>${esc(site.forecast.cloudCover)}% cloud cover · source: ${esc(site.forecast.source || "last known")}</p>`;
  $("#externalEvidenceResult").innerHTML =
    `<h2>${esc(site.name)} · ${esc(site.propertyAssessment.setting)} exposure</h2><p>${esc(site.propertyAssessment.summary)}</p><ul>${(site.propertyAssessment.factors || []).map((factor) => `<li>${esc(factor)}</li>`).join("")}</ul><small>Water feature: ${esc(site.propertyAssessment.waterFeature)} · confidence: ${esc(site.propertyAssessment.confidence)}</small>`;
}

function renderExternalAnalysisPanel() {
  if (!hasExternalEvidence()) return;
  const site = state.sites.find((entry) => entry.propertyAssessment);
  if (!site?.propertyAssessment) return;
  const assessment = site.propertyAssessment;
  const hour = Number(site.forecast.localHour) || 12;
  const sunFactor =
    hour >= 11 && hour < 16 ? 1.35 : hour >= 9 && hour < 17 ? 1.08 : 0.65;
  const cloudCover = Math.max(
    0,
    Math.min(100, Number(site.forecast.cloudCover) || 0),
  );
  const cloudFactor =
    cloudCover >= 70
      ? Math.max(0.1, 1 - cloudCover / 100)
      : cloudCover >= 50
        ? 0.75
        : cloudCover >= 20
          ? 1.08
          : 1;
  const albedoFactor =
    { shaded: 0.85, mixed: 1.1, open: 1.2, reflective: 2, uncertain: 1.25 }[
      assessment.setting
    ] || 1.25;
  const doseIndex =
    Math.round(
      Number(site.forecast.uvi) * sunFactor * cloudFactor * albedoFactor * 10,
    ) / 10;
  const materials = assessment.reflectiveMaterials?.length
    ? assessment.reflectiveMaterials.join(", ")
    : "No reflective material confirmed";
  const shade = assessment.shadeObservations?.length
    ? assessment.shadeObservations.join(", ")
    : "No shade observation confirmed";
  $("#weatherResult").innerHTML =
    `<h2>${esc(site.propertyObjectName || site.name)}</h2><dl class="externalAnalysis"><div><dt>Current weather parser</dt><dd>UVI ${esc(site.forecast.uvi)} · ${esc(site.forecast.temperatureC)}°C · ${esc(cloudCover)}% cloud cover · ${String(hour).padStart(2, "0")}:00 · ${esc(site.forecast.source || "last known")}</dd></div><div><dt>Vision assessment</dt><dd>Setting: ${esc(assessment.setting)} · Materials: ${esc(materials)} · Shade: ${esc(shade)} · Water: ${esc(assessment.waterFeature)}</dd></div><div><dt>Albedo multiplier</dt><dd>${esc(albedoFactor)}× (${esc(assessment.setting)})</dd></div><div><dt>Planning dose index</dt><dd><b>${esc(doseIndex)}</b> = ${esc(site.forecast.uvi)} UVI × ${esc(sunFactor)} time × ${esc(cloudFactor)} cloud × ${esc(albedoFactor)} albedo</dd></div></dl><p class="calculationNote">Time: 11:00–16:00 = 1.35×; 09:00–11:00 and 16:00–17:00 = 1.08×; otherwise = 0.65×. Light haze = 1.08×; 50–69% cloud = 0.75×; 70–90% cloud = 0.3–0.1×.</p>`;
}

function renderExternalTimeline() {
  if (!hasExternalEvidence()) return;
  if (!$("#externalEvidenceTimeline")) return;
  const items = (state.activity || [])
    .filter((item) =>
      /weather|imagery|photo|UV|surface/i.test(item.message + item.detail),
    )
    .slice(0, 6);
  $("#externalEvidenceTimeline").innerHTML =
    `<p class="eyebrow">EVIDENCE TIMELINE</p>${items.map((item) => `<div><time>${clock(item.at)}</time><span>${esc(item.message)}</span><small>${esc(item.detail)}</small></div>`).join("") || "<small>Waiting for incoming environmental evidence.</small>"}`;
}

function renderShift() {
  renderTeamProfiles();
  return;
  const topSite = state.portfolio[0];
  const decision = state.decisions[0];
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
      const protection = worker.behavioralFactors || {};
      const priorityReason = needsBreak
        ? "Highest exposure score; break rotation required now."
        : `${worker.tier} risk tier · ${location.toLowerCase()} conditions.`;
      return `<article class="crewRow"><span class="crewInitial figurine ${avatar}"><i></i><em></em></span><span><b>${esc(worker.name)}</b><small>${esc(worker.role)} · ${esc(site?.name || "Unassigned")}</small></span><span class="crewStatus ${needsBreak ? "break" : location.includes("shade") ? "shade" : "sun"}">${location}</span><span><small>Last break</small><b>—</b></span><span><small>Next break</small><b>${needsBreak ? "Now" : "In 45 min"}</b></span><span class="crewProtections"><small>PPE ${esc(protection.upf || "unrecorded")} · SPF ${esc(protection.spf || "unrecorded")} · Shade ${esc(protection.shadeAvailability || "unrecorded")}</small></span><span class="crewPriority"><small>${esc(priorityReason)}</small></span><span class="crewScore">${score}</span></article>`;
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
function renderTeamProfiles() {
  $("#crewTitle").textContent = "Employee profiles";
  const crew = state.workers.filter((worker) => worker.status === "active");
  $("#crewCount").textContent =
    `${crew.length} profile${crew.length === 1 ? "" : "s"}`;
  $("#crewList").innerHTML =
    (crew.length
      ? `<div class="crewProfileHeader"><span></span><span>Employee & age <span class="infoTip" data-tooltip="Age helps Umbra apply a cautious heat-recovery modifier for older workers.">i</span></span><span>Fitzpatrick type <span class="infoTip" data-tooltip="A 1–6 skin-response scale used to estimate how quickly UV exposure may cause burning. Type 1 generally burns fastest; Type 6 generally burns more slowly.">i</span></span><span>Sensitivity <span class="infoTip" data-tooltip="Self-reported individual sensitivity raises or lowers the worker’s UV-planning priority.">i</span></span><span>Medical markers <span class="infoTip" data-tooltip="Self-reported photosensitivity context, such as medication. It flags a cautious planning review; it is not a diagnosis.">i</span></span><span>Actions <span class="infoTip" data-tooltip="Edit or delete this employee profile.">i</span></span></div>`
      : "") +
      crew
        .map((worker) => {
          const avatar = esc(worker.exposureProfile?.avatar || "builder");
          const profile = worker.exposureProfile || {};
          return `<article class="crewProfileRow"><span class="crewInitial figurine ${avatar}"><i></i><em></em></span><span><b>${esc(worker.name)}</b><small>${esc(worker.age)} years old</small></span><span><small>Fitzpatrick type</small><b>${esc(profile.fitzpatrickType || "Not recorded")}</b></span><span><small>Sensitivity</small><b>${esc(profile.photosensitivity || "Not recorded")}</b></span><span><small>Medical markers</small><b>${esc(profile.medicalMarkers || "None reported")}</b></span><span class="crewActions"><button class="crewEdit" data-worker-id="${esc(worker.id)}" type="button" title="Edit employee profile" aria-label="Edit ${esc(worker.name)}">✎</button><button class="crewDelete" data-worker-id="${esc(worker.id)}" type="button" title="Delete employee profile" aria-label="Delete ${esc(worker.name)}">×</button></span></article>`;
        })
        .join("") ||
    '<p class="emptyState">Add the first employee profile to begin the team roster.</p>';
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
  const hasEmployees = state?.workers?.length > 0;
  if (mode !== "team" && !(mode === "external" && hasEmployees)) {
    applyForemanGate();
    return;
  }
  currentMode = mode;
  if (foremanProfile?.name && foremanProfile?.company)
    localStorage.setItem(lastModeKey(), mode);
  updateModeSlider();
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
  if (!site) {
    map.innerHTML = '<div class="mapEmpty">No active site is available.</div>';
    return;
  }
  const hour = Number($("#sunTime").value);
  const angle = 25 + ((hour - 6) / 12) * 130;
  const image = site.propertyPhotos?.[0] || {
    image: "",
    angle: "Imagery unavailable",
  };
  $("#mapTitle").textContent = `${site.name} placement preview`;
  map.innerHTML = `${image.image ? `<img src="${image.image}" alt="${esc(image.angle)}" />` : '<div class="mapSchematic"><span>NEUTRAL SITE SCHEMATIC</span><i></i><b></b></div>'}<div class="sunVector" style="--sun:${angle}deg"></div><div class="shadeZone" style="--sun:${angle}deg"></div><div class="mapCaption">${esc(site.name)} · ${esc(image.angle)} · ${esc(site.propertyAssessment?.summary || "Neutral planning schematic; verify site controls on location.")}</div>`;
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
    ? `${high.map((worker) => worker.name).join(", ")} is in an unsafe direct-exposure zone. Relocate to the shaded lower-left zone or schedule a break.`
    : exposed.length
      ? `${exposed.length} crew member(s) are in an unsafe direct-exposure zone. Recommended relocation: shaded lower-left zone.`
      : "Crew is within the recommended shade zone.";
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
  get foremanProfile() {
    return foremanProfile;
  },
  set foremanProfile(value) {
    foremanProfile = value;
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
