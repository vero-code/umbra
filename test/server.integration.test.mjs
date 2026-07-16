import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("HTTP workflow generates, replans, and approves a plan", async (t) => {
  const port = "3217";
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: port },
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server did not start")),
      4000,
    );
    child.stdout.on("data", (data) => {
      if (data.toString().includes("Umbra is running")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", reject);
  });
  t.after(() => child.kill());
  const post = async (path, payload) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(
      response.status,
      [
        "/api/plan",
        "/api/replan",
        "/api/scenario",
        "/api/roster/import",
        "/api/property/assess",
        "/api/team-member",
        "/api/photo-audit",
      ].includes(path)
        ? 201
        : 200,
    );
    return response.json();
  };
  await post("/api/reset", {});
  const refreshed = await post("/api/refresh-conditions", {
    siteId: "site_north",
  });
  assert.ok(
    ["baseline", "open-meteo"].includes(refreshed.site.forecast.source),
  );
  const photo = await post("/api/photo", {
    siteId: "site_north",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9dQAAAABJRU5ErkJggg==",
    note: "Bright roof surface",
  });
  assert.equal(photo.site.photo.setting, "uncertain");
  const generated = await post("/api/plan", {
    siteId: "site_north",
    useModel: false,
  });
  assert.equal(generated.plan.priorityWorkers[0].id, "w1");
  const changed = await post("/api/scenario", {
    type: "heat_wave",
    payload: {},
  });
  assert.ok(changed.decisions.length >= 3);
  const approved = await post("/api/approve", {
    planId: changed.state.plans[0].id,
  });
  assert.equal(approved.plan.status, "approved");
  const imported = await post("/api/roster/import", {
    csv: "name,site,role,tier\nDrew Cole,West Yard,Loader,standard",
  });
  assert.equal(imported.imported, 1);
  const scenario = await post("/api/scenario", {
    type: "equipment_failed",
    payload: { siteId: "site_river" },
  });
  assert.equal(scenario.decisions[0].status, "needs_review");
  const property = await post("/api/property/assess", {
    siteId: "site_north",
    location: "Roof deck north side",
    photos: [
      {
        angle: "North-facing roof",
        image:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9dQAAAABJRU5ErkJggg==",
      },
    ],
  });
  assert.equal(property.site.propertyLocation, "Roof deck north side");
  assert.ok(property.decisions.length > 0);
  const member = await post("/api/team-member", {
    name: "Kai Snow",
    siteId: "site_west",
    role: "Spotter",
    tier: "elevated",
    photosensitivity: "high",
    outdoorHistory: "regular",
  });
  assert.equal(member.worker.exposureProfile.photosensitivity, "high");
  const audit = await post("/api/photo-audit", {
    siteId: "site_north",
    prompt: "Fresh concrete roof",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9dQAAAABJRU5ErkJggg==",
  });
  assert.equal(audit.audit.source, "simulated");
  assert.ok(audit.decisions.length > 0);
});
