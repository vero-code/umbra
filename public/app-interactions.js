export async function setupInteractions(runtime) {
  const { $, request, readFile } = runtime;
  $("#foremanProfileForm").onsubmit = (event) => {
    event.preventDefault();
    const profile = Object.fromEntries(new FormData(event.target));
    runtime.foremanProfile = profile;
    localStorage.setItem("umbra_foreman_profile", JSON.stringify(profile));
    event.target.reset();
    runtime.render();
    runtime.switchMode("team");
  };
  $("#foremanIdentity").onclick = () => {
    const actions = $("#foremanActions");
    const willOpen = actions.hidden;
    actions.hidden = !willOpen;
    $("#foremanIdentity").setAttribute("aria-expanded", String(willOpen));
  };
  $("#signOutForeman").onclick = () => {
    if (!window.confirm("End this shift and return to foreman sign-in?"))
      return;
    localStorage.removeItem("umbra_foreman_profile");
    runtime.foremanProfile = null;
    runtime.switchMode("team");
    runtime.render();
  };
  document.addEventListener("click", (event) => {
    if ($("#foremanProfileMenu").contains(event.target)) return;
    $("#foremanActions").hidden = true;
    $("#foremanIdentity").setAttribute("aria-expanded", "false");
  });
  document
    .querySelectorAll(".modeNav button")
    .forEach(
      (button) =>
        (button.onclick = () => runtime.switchMode(button.dataset.mode)),
    );
  $("#sunTime").oninput = () => {
    $("#sunLabel").textContent =
      `${String($("#sunTime").value).padStart(2, "0")}:00`;
    runtime.renderFacility();
  };
  $("#auditForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const file = $("#auditPhoto").files[0];
      const image = await readFile(file);
      const data = await request("/api/photo-audit", {
        method: "POST",
        body: JSON.stringify({
          siteId: $("#auditSite").value,
          prompt: $("#auditPrompt").value,
          image,
        }),
      });
      runtime.state = data.state;
      runtime.render();
    } catch (error) {
      alert(error.message);
    }
  };
  $("#teamProfileForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.target);
      const photoFile = form.get("photo");
      const photo = photoFile?.size ? await readFile(photoFile) : null;
      const data = await request("/api/team-member", {
        method: "POST",
        body: JSON.stringify({ ...Object.fromEntries(form), photo }),
      });
      runtime.state = data.state;
      teamProfileDirty = false;
      event.target.reset();
      runtime.render();
    } catch (error) {
      alert(error.message);
    }
  };
  $("#teamProfileForm").addEventListener("input", () => {
    teamProfileDirty = true;
  });
  $("#externalFactorsForm").addEventListener("input", () => {
    externalFactorsDirty = true;
  });
  $("#behavioralFactorsForm").addEventListener("input", () => {
    behavioralFactorsDirty = true;
  });
  $("#behaviorWorker").onchange = () => runtime.renderBehavioralFactors();
  $("#behavioralFactorsForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = await request("/api/behavioral-factors", {
        method: "POST",
        body: JSON.stringify({
          workerId: $("#behaviorWorker").value,
          upf: $("#behaviorUpf").value,
          spf: $("#behaviorSpf").value,
          sunscreenHoursAgo: $("#behaviorSunscreenHours").value,
          shadeAvailability: $("#behaviorShade").value,
        }),
      });
      runtime.state = data.state;
      runtime.shownDecisionId = data.decisions[0]?.id;
      behavioralFactorsDirty = false;
      runtime.render();
    } catch (error) {
      alert(error.message);
    }
  };
  $("#externalFactorsForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const siteId = $("#externalSite").value;
      const files = [...$("#externalPhotos").files];
      if (files.length < 2)
        throw new Error("Add at least two photos from different angles");
      $("#weatherResult").innerHTML =
        "<h2>Parsing weather...</h2><p>Fetching current UV, temperature, and cloud cover.</p>";
      const weather = await request("/api/refresh-conditions", {
        method: "POST",
        body: JSON.stringify({ siteId }),
      });
      const photos = await Promise.all(
        files.map(async (file, index) => ({
          image: await readFile(file),
          angle: `Object angle ${index + 1}`,
          note: $("#externalNotes").value,
        })),
      );
      const result = await request("/api/property/assess", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          location: $("#externalLocation").value,
          photos,
        }),
      });
      runtime.state = result.runtime.state;
      externalFactorsDirty = false;
      $("#weatherResult").innerHTML =
        `<h2>UVI ${esc(weather.site.forecast.uvi)} · ${esc(weather.site.forecast.temperatureC)}C</h2><p>${esc(weather.site.forecast.cloudCover)}% cloud cover · source: ${esc(weather.site.forecast.source || "last known")}</p>`;
      event.target.reset();
      runtime.render();
    } catch (error) {
      alert(error.message);
    }
  };
  $("#incidentForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const type = $("#incidentType").value;
      const siteId = $("#incidentSite").value;
      const payload =
        type === "worker_absent"
          ? {
              workerId: runtime.state.workers.find(
                (worker) =>
                  worker.siteId === siteId && worker.status === "active",
              )?.id,
            }
          : { siteId };
      const data = await request("/api/scenario", {
        method: "POST",
        body: JSON.stringify({ type, payload }),
      });
      runtime.state = data.state;
      runtime.shownDecisionId = data.decisions[0]?.id;
      runtime.render();
    } catch (error) {
      alert(error.message);
    }
  };
  runtime.state = await request("/api/state");
  runtime.render();
  runtime.switchMode("shift");
}
