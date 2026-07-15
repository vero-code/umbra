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
      path === "/api/plan" || path === "/api/replan" ? 201 : 200,
    );
    return response.json();
  };
  await post("/api/reset", {});
  const refreshed = await post("/api/refresh-conditions", {
    siteId: "site_north",
  });
  assert.ok(["demo", "open-meteo"].includes(refreshed.site.forecast.source));
  const photo = await post("/api/photo", {
    siteId: "site_north",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9dQAAAABJRU5ErkJggg==",
    note: "Bright roof surface",
  });
  assert.equal(photo.site.photo.setting, "reflective");
  const generated = await post("/api/plan", {
    siteId: "site_north",
    useModel: false,
  });
  assert.equal(generated.plan.priorityWorkers[0].id, "w1");
  const changed = await post("/api/replan", {
    siteId: "site_north",
    trigger: "UV spike",
  });
  assert.ok(changed.plan.alerts.some((alert) => alert.includes("UV")));
  const approved = await post("/api/approve", { planId: changed.plan.id });
  assert.equal(approved.plan.status, "approved");
});
