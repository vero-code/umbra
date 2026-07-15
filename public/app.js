let state;
const placements = new Map();
const $ = (selector) => document.querySelector(selector);
async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
function time(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function render() {
  $("#portfolioCount").textContent = state.sites.length;
  $("#decisionCount").textContent = state.decisions.length;
  $("#eventCount").textContent = state.events.length;
  $("#agentStatus").textContent = state.events[0]
    ? `Last event: ${state.events[0].type.replaceAll("_", " ")}`
    : "Monitoring live inputs";
  $("#portfolio").innerHTML = state.portfolio
    .map(
      (site, index) =>
        `<button class="priorityRow" data-site="${site.siteId}"><span class="rank">0${index + 1}</span><span><b>${escape(site.name)}</b><small>${site.activeCrew} active crew · UVI ${site.uvi} · ${site.setting}</small></span><span class="severity ${site.status}">${site.exposureScore}</span><span class="recommendation">${escape(site.recommendation)}</span></button>`,
    )
    .join("");
  document
    .querySelectorAll(".priorityRow")
    .forEach(
      (button) =>
        (button.onclick = () =>
          showDecision(
            state.decisions.find(
              (decision) => decision.siteId === button.dataset.site,
            ),
          )),
    );
  showDecision(state.decisions[0], true);
  $("#timeline").innerHTML =
    state.decisions
      .slice(0, 7)
      .map(
        (decision) =>
          `<button class="timelineItem" data-decision="${decision.id}"><time>${time(decision.createdAt)}</time><div><b>${escape(decision.siteName || "Portfolio")}</b><p>${escape(decision.recommendation)}</p></div><span class="status ${decision.status}">${decision.status.replaceAll("_", " ")}</span></button>`,
      )
      .join("") ||
    '<p class="empty">No events yet. Refresh conditions or run a scenario to begin.</p>';
  document
    .querySelectorAll(".timelineItem")
    .forEach(
      (button) =>
        (button.onclick = () =>
          showDecision(
            state.decisions.find(
              (decision) => decision.id === button.dataset.decision,
            ),
          )),
    );
  const template = $("#siteInput");
  const target = $("#siteInputs");
  target.innerHTML = "";
  state.sites.forEach((site) => {
    const node = template.content.cloneNode(true);
    node.querySelector(".siteName").textContent = site.name;
    node.querySelector(".siteMeta").textContent =
      `${site.task} · ${site.forecast.source}`;
    node.querySelector(".refresh").onclick = () => refresh(site.id);
    node.querySelector(".absence").onclick = () =>
      scenario("worker_absent", {
        workerId: state.workers.find(
          (worker) => worker.siteId === site.id && worker.status === "active",
        )?.id,
      });
    node.querySelector(".failure").onclick = () =>
      scenario("equipment_failed", { siteId: site.id });
    node.querySelector(".photo").onchange = (event) => photo(site.id, event);
    target.append(node);
  });
  [$("#propertySite"), $("#memberSite")].forEach((select) => {
    const current = select.value;
    select.innerHTML = `<option value="">Select job site</option>${state.sites.map((site) => `<option value="${site.id}">${escape(site.name)}</option>`).join("")}`;
    select.value = current;
  });
  renderSunStage();
}
function showDecision(decision, preserve = false) {
  if (!decision && preserve) return;
  const target = $("#activeDecision");
  if (!decision) {
    target.className = "empty";
    target.textContent = "No decision selected.";
    return;
  }
  target.className = "decision";
  target.innerHTML = `<span class="status ${decision.status}">${decision.status.replaceAll("_", " ")}</span><h2>${escape(decision.recommendation)}</h2><p class="decisionSite">${escape(decision.siteName || "Portfolio")} · exposure score ${decision.severity}</p><div class="chain"><p class="eyebrow">EXPLAINABLE DECISION CHAIN</p><ol>${decision.reasoningChain.map((item) => `<li>${escape(item)}</li>`).join("")}</ol></div>`;
}
async function refresh(siteId) {
  try {
    const data = await request("/api/refresh-conditions", {
      method: "POST",
      body: JSON.stringify({ siteId }),
    });
    state = data.state;
    render();
  } catch (error) {
    alert(error.message);
  }
}
async function scenario(type, payload) {
  try {
    if (!payload.workerId && type === "worker_absent")
      return alert("No active worker remains at this site.");
    const data = await request("/api/scenario", {
      method: "POST",
      body: JSON.stringify({ type, payload }),
    });
    state = data.state;
    render();
  } catch (error) {
    alert(error.message);
  }
}
async function photo(siteId, event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = await request("/api/photo", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          image: reader.result,
          note: "Operational site photo uploaded",
        }),
      });
      state = data.state;
      render();
    } catch (error) {
      alert(error.message);
    }
  };
  reader.readAsDataURL(file);
}
function selectedStageSite() {
  return (
    state.sites.find((site) => site.propertyPhotos?.length) || state.sites[0]
  );
}
function renderSunStage() {
  const site = selectedStageSite();
  const target = $("#sunStage");
  if (!site?.propertyPhotos?.length) return;
  const photo = site.propertyPhotos[0];
  const hour = Number($("#sunTime").value);
  const angle = 20 + ((hour - 6) / 12) * 140;
  const workers = state.workers.filter(
    (worker) => worker.siteId === site.id && worker.status === "active",
  );
  target.innerHTML = `<img src="${photo.image}" alt="Property view: ${escape(photo.angle)}" /><div class="sunRay" style="--angle:${angle}deg"></div><div class="shadow" style="--angle:${angle}deg"></div><div class="stageCaption">${escape(site.name)} · ${escape(photo.angle)} · ${escape(site.propertyAssessment?.summary || "Awaiting vision assessment")}</div>`;
  workers.forEach((worker, index) => {
    const placement = placements.get(worker.id) || {
      x: 24 + index * 18,
      y: 66,
    };
    const icon = document.createElement("button");
    icon.className = "workerIcon";
    icon.dataset.worker = worker.id;
    icon.style.left = `${placement.x}%`;
    icon.style.top = `${placement.y}%`;
    icon.innerHTML = `<span>◆</span>${escape(worker.name.split(" ")[0])}`;
    icon.onpointerdown = (event) => dragWorker(event, icon, worker, site);
    target.append(icon);
  });
  assessPlacement(site);
}
function dragWorker(event, icon, worker, site) {
  icon.setPointerCapture(event.pointerId);
  const move = (pointer) => {
    const bounds = $("#sunStage").getBoundingClientRect();
    const x = Math.max(
      4,
      Math.min(92, ((pointer.clientX - bounds.left) / bounds.width) * 100),
    );
    const y = Math.max(
      12,
      Math.min(84, ((pointer.clientY - bounds.top) / bounds.height) * 100),
    );
    placements.set(worker.id, { x, y });
    icon.style.left = `${x}%`;
    icon.style.top = `${y}%`;
    assessPlacement(site);
  };
  icon.onpointermove = move;
  icon.onpointerup = () => {
    icon.onpointermove = null;
    icon.onpointerup = null;
  };
}
function assessPlacement(site) {
  const hour = Number($("#sunTime").value);
  const shadeBoundary = 38 + Math.abs(hour - 12) * 3;
  const exposed = state.workers
    .filter((worker) => worker.siteId === site.id && worker.status === "active")
    .filter((worker) => (placements.get(worker.id)?.x ?? 50) > shadeBoundary);
  const high = exposed.filter(
    (worker) =>
      worker.exposureProfile?.photosensitivity === "high" ||
      worker.tier === "high",
  );
  const label = $("#placementRisk");
  if (high.length) {
    label.className = "status needs_review";
    label.textContent = `${high.map((worker) => worker.name).join(", ")} placed in higher-exposure area`;
  } else if (exposed.length) {
    label.className = "status needs_review";
    label.textContent = `${exposed.length} crew member(s) in direct-exposure area`;
  } else {
    label.className = "status approved_candidate";
    label.textContent = "Crew placement is within the approximate shade zone";
  }
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
        angle: `${angle}${files.length > 1 ? ` ${index + 1}` : ""}`,
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
    event.target.reset();
    render();
  } catch (error) {
    alert(error.message);
  }
};
$("#memberForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(event.target);
    const photoFile = form.get("photo");
    const photo = photoFile?.size ? await readFile(photoFile) : null;
    const data = await request("/api/team-member", {
      method: "POST",
      body: JSON.stringify({ ...Object.fromEntries(form), photo }),
    });
    state = data.state;
    event.target.reset();
    render();
  } catch (error) {
    alert(error.message);
  }
};
$("#sunTime").oninput = () => {
  $("#sunLabel").textContent =
    `${String($("#sunTime").value).padStart(2, "0")}:00`;
  renderSunStage();
};
$("#heatWave").onclick = () => scenario("heat_wave", {});
$("#reset").onclick = async () => {
  state = await request("/api/reset", { method: "POST" });
  render();
};
$("#roster").onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = await request("/api/roster/import", {
        method: "POST",
        body: JSON.stringify({ csv: reader.result }),
      });
      state = data.state;
      render();
    } catch (error) {
      alert(error.message);
    }
  };
  reader.readAsText(file);
};
state = await request("/api/state");
render();
