let state, latestPlan;
const $ = (s) => document.querySelector(s);
async function request(path, options = {}) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
function fmtTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function render() {
  const grid = $("#siteGrid");
  grid.innerHTML = "";
  const template = $("#siteTemplate");
  state.sites.forEach((site) => {
    const node = template.content.cloneNode(true);
    node.querySelector(".siteName").textContent = site.name;
    node.querySelector(".task").textContent = site.task;
    node.querySelector(".uvi").textContent = `UVI ${site.forecast.uvi}`;
    node.querySelector(".weather").textContent =
      `${site.forecast.temperatureC}°C · ${site.forecast.cloudCover}% cloud · ${site.shift}`;
    node.querySelector(".setting").textContent =
      `Exposure setting: ${site.setting}${site.photo ? ` · Photo: ${site.photo.summary}` : ""}`;
    node.querySelector(".generate").onclick = () => plan(site.id);
    node.querySelector(".refresh").onclick = () => refresh(site.id);
    node.querySelector(".spike").onclick = () => replan(site.id);
    node.querySelector(".photo").onchange = (e) => upload(site.id, e);
    grid.append(node);
  });
  $("#auditList").innerHTML =
    state.audit
      .slice(0, 6)
      .map(
        (a) =>
          `<div class="auditItem"><strong>${a.detail}</strong><time>${fmtTime(a.at)} · ${a.type.replace("_", " ")}</time></div>`,
      )
      .join("") || '<p class="empty">Actions will be recorded here.</p>';
}
function renderPlan(plan) {
  latestPlan = plan;
  $("#planEmpty").hidden = true;
  const c = $("#planContent");
  c.hidden = false;
  $("#planTitle").textContent = plan.siteName;
  const st = $("#planStatus");
  st.textContent = plan.status.replace("_", " ");
  st.className = `pill ${plan.status}`;
  c.innerHTML = `<div class="priority">${plan.priorityWorkers.map((w, i) => `<div class="person"><span class="score">${w.score}</span><strong>${i + 1}. ${w.name}</strong><small>${w.role} · ${w.tier} tier</small></div>`).join("")}</div><p class="eyebrow">ROTATION BLOCKS</p>${plan.rotationBlocks.map((b) => `<div class="rotation"><b>${b.window} · ${b.breakMinutes} MIN</b><span>${b.workers.map((id) => state.workers.find((w) => w.id === id)?.name).join(" + ")}</span></div>`).join("")}<div class="alerts">${plan.alerts.map((a) => `<div class="alert">${a}</div>`).join("")}</div><div class="rationale"><strong>Why this plan</strong><br>${[...plan.rationale, plan.modelRationale?.summary].filter(Boolean).join(" ")}</div>${plan.status !== "approved" ? '<button class="approve" id="approve">Approve plan</button>' : ""}`;
  const approve = $("#approve");
  if (approve) approve.onclick = approvePlan;
}
async function plan(siteId) {
  try {
    const d = await request("/api/plan", {
      method: "POST",
      body: JSON.stringify({ siteId }),
    });
    state = d.state;
    render();
    renderPlan(d.plan);
  } catch (e) {
    alert(e.message);
  }
}
async function refresh(siteId) {
  try {
    const d = await request("/api/refresh-conditions", {
      method: "POST",
      body: JSON.stringify({ siteId }),
    });
    state = d.state;
    render();
    alert(
      d.refreshed
        ? "Live conditions refreshed."
        : "Live provider unavailable; retained the last known conditions.",
    );
  } catch (e) {
    alert(e.message);
  }
}
async function replan(siteId) {
  try {
    const d = await request("/api/replan", {
      method: "POST",
      body: JSON.stringify({ siteId, trigger: "UV and heat spike detected" }),
    });
    state = d.state;
    render();
    renderPlan(d.plan);
  } catch (e) {
    alert(e.message);
  }
}
async function approvePlan() {
  const d = await request("/api/approve", {
    method: "POST",
    body: JSON.stringify({ planId: latestPlan.id }),
  });
  state = d.state;
  render();
  renderPlan(d.plan);
}
async function upload(siteId, event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const d = await request("/api/photo", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          image: reader.result,
          note: "Supervisor uploaded site photo",
        }),
      });
      state = d.state;
      render();
    } catch (e) {
      alert(e.message);
    }
  };
  reader.readAsDataURL(file);
}
$("#reset").onclick = async () => {
  state = await request("/api/reset", { method: "POST" });
  latestPlan = null;
  $("#planContent").hidden = true;
  $("#planEmpty").hidden = false;
  $("#planTitle").textContent = "Select “Generate plan” for a site";
  $("#planStatus").textContent = "Waiting";
  render();
};
state = await request("/api/state");
render();
