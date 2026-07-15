let state;
let shownDecisionId;
let currentMode = "brief";
const placements = new Map();
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
  document.querySelectorAll(".siteRow").forEach(
    (row) =>
      (row.onclick = () => {
        shownDecisionId = state.decisions.find(
          (decision) => decision.siteId === row.dataset.site,
        )?.id;
        render();
      }),
  );
  [$("#propertySite"), $("#memberSite")].forEach((select) => {
    const saved = select.value;
    select.innerHTML = `<option value="">Select job site</option>${state.sites.map((site) => `<option value="${site.id}">${esc(site.name)}</option>`).join("")}`;
    select.value = saved;
  });
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
}
function renderDecision(decision) {
  $("#missionTitle").textContent = decision.recommendation;
  $("#missionSub").textContent =
    `${decision.siteName} is the highest current operational priority.`;
  $("#confidence").textContent = decision.confidence;
  $("#recommendationBody").innerHTML =
    `<p class="trigger">Triggered by <b>${esc(decision.triggeringEvent)}</b></p><h2>${esc(decision.recommendation)}</h2><p class="whyNow">${esc(decision.whyNow)}</p><dl><div><dt>What changed</dt><dd>${esc(decision.whatChanged)}</dd></div><div><dt>Operational impact</dt><dd>${esc(decision.operationalImpact)}</dd></div></dl>`;
  $("#reasoningBody").innerHTML =
    `<section><p class="label">EVIDENCE</p><ul>${decision.reasoningChain.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section><section><p class="label">REASONING</p><p>${esc(decision.whyWorker)}</p><p>${esc(decision.whyNow)}</p></section><section><p class="label">TRADEOFF</p><p>${esc(decision.operationalImpact)}</p><p>${esc(decision.alternative)}</p></section><section class="final"><p class="label">DECISION</p><strong>${esc(decision.recommendation)}</strong><span>Supervisor approval required.</span></section>`;
  const button = $("#approve");
  button.hidden = decision.status === "approved";
  button.onclick = () => approve(decision.planId);
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
$("#memberForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const data = await request("/api/team-member", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target))),
    });
    state = data.state;
    render();
    event.target.reset();
  } catch (error) {
    alert(error.message);
  }
};
$("#copilotForm").onsubmit = (event) => {
  event.preventDefault();
  const question = $("#copilotInput").value.trim();
  if (!question) return;
  const top = activeDecision();
  const uv11 = /uv.*11|11.*uv/i.test(question);
  const river = /riverfront|moves? to river/i.test(question);
  const crane = /crane|delay/i.test(question);
  const change = uv11
    ? "At UV 11, the agent would elevate every open or reflective site and shorten the next rotation."
    : river
      ? "Moving Maya to Riverfront shifts the highest-sensitivity worker away from the reflective roof, but adds a coverage gap at North Tower."
      : crane
        ? "A crane delay reduces roof completion capacity; Umbra would keep only essential crew in direct exposure and advance relief rotations."
        : "Umbra would compare the requested change against active exposure, coverage, and equipment constraints.";
  $("#copilotAnswer").innerHTML =
    `<b>Simulated operational assessment</b><p>${esc(change)}</p><small>Current tradeoff: ${esc(top?.alternative || "No active alternative available.")}</small>`;
};
async function sync() {
  try {
    const next = await request("/api/state");
    const changed = next.activity?.[0]?.id !== state?.activity?.[0]?.id;
    state = next;
    if (changed || !shownDecisionId) render();
  } catch {}
}

function switchMode(mode) {
  currentMode = mode;
  $("#briefMode").hidden = mode !== "brief";
  $("#incidentMode").hidden = mode !== "incident";
  $("#workspaceMode").hidden = mode !== "workspace";
  document
    .querySelectorAll(".modeNav button")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.mode === mode),
    );
  if (mode === "workspace") renderFacility();
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
document
  .querySelectorAll(".modeNav button")
  .forEach(
    (button) => (button.onclick = () => switchMode(button.dataset.mode)),
  );
$("#sunTime").oninput = () => {
  $("#sunLabel").textContent =
    `${String($("#sunTime").value).padStart(2, "0")}:00`;
  renderFacility();
};
$("#incidentForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const type = $("#incidentType").value;
    const siteId = $("#incidentSite").value;
    const payload =
      type === "worker_absent"
        ? {
            workerId: state.workers.find(
              (worker) =>
                worker.siteId === siteId && worker.status === "active",
            )?.id,
          }
        : { siteId };
    const data = await request("/api/scenario", {
      method: "POST",
      body: JSON.stringify({ type, payload }),
    });
    state = data.state;
    shownDecisionId = data.decisions[0]?.id;
    render();
  } catch (error) {
    alert(error.message);
  }
};
state = await request("/api/state");
render();
setInterval(sync, 2200);
