import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPlan,
  replan,
  seedState,
  validatePlan,
  analyzePhotoWithModel,
  refreshForecast,
} from "./src/planner.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const storeDir = join(root, "data");
const storePath = join(storeDir, "umbra.json");
const port = Number(process.env.PORT || 3000);

async function getState() {
  if (!existsSync(storePath)) return seedState();
  return JSON.parse(await readFile(storePath, "utf8"));
}
async function saveState(state) {
  await mkdir(storeDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(state, null, 2));
}
function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 6_000_000) throw new Error("Payload too large");
  }
  return raw ? JSON.parse(raw) : {};
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/state")
      return json(res, 200, await getState());
    if (req.method === "POST" && url.pathname === "/api/plan") {
      const state = await getState();
      const input = await body(req);
      const plan = await createPlan(state, input.siteId, {
        useModel: input.useModel !== false,
      });
      state.plans.unshift(plan);
      state.audit.unshift({
        at: new Date().toISOString(),
        type: "plan_generated",
        detail: `${plan.siteName}: ${plan.status}`,
      });
      await saveState(state);
      return json(res, 201, { plan, state });
    }
    if (req.method === "POST" && url.pathname === "/api/refresh-conditions") {
      const state = await getState();
      const { siteId } = await body(req);
      const site = state.sites.find((s) => s.id === siteId);
      if (!site) return json(res, 404, { error: "Site not found" });
      const result = await refreshForecast(site);
      state.audit.unshift({
        at: new Date().toISOString(),
        type: result.refreshed ? "conditions_refreshed" : "conditions_retained",
        detail: `${site.name}: ${site.forecast.source || "last known"} conditions`,
      });
      await saveState(state);
      return json(res, 200, { site, refreshed: result.refreshed, state });
    }
    if (req.method === "POST" && url.pathname === "/api/replan") {
      const state = await getState();
      const input = await body(req);
      const plan = await replan(
        state,
        input.siteId,
        input.trigger || "Conditions changed",
      );
      state.plans.unshift(plan);
      state.audit.unshift({
        at: new Date().toISOString(),
        type: "replanned",
        detail: `${plan.siteName}: ${input.trigger || "Conditions changed"}`,
      });
      await saveState(state);
      return json(res, 201, { plan, state });
    }
    if (req.method === "POST" && url.pathname === "/api/approve") {
      const state = await getState();
      const { planId } = await body(req);
      const plan = state.plans.find((p) => p.id === planId);
      if (!plan) return json(res, 404, { error: "Plan not found" });
      plan.status = "approved";
      plan.approvedAt = new Date().toISOString();
      state.audit.unshift({
        at: plan.approvedAt,
        type: "plan_approved",
        detail: plan.siteName,
      });
      await saveState(state);
      return json(res, 200, { plan, state });
    }
    if (req.method === "POST" && url.pathname === "/api/photo") {
      const state = await getState();
      const { siteId, image, note = "" } = await body(req);
      const site = state.sites.find((s) => s.id === siteId);
      if (!site || !String(image).startsWith("data:image/"))
        return json(res, 400, { error: "A valid site and image are required" });
      const analysis = await analyzePhotoWithModel(image, note);
      site.photo = {
        image,
        note,
        capturedAt: new Date().toISOString(),
        ...analysis,
      };
      state.audit.unshift({
        at: site.photo.capturedAt,
        type: "photo_analyzed",
        detail: `${site.name}: ${analysis.setting}`,
      });
      await saveState(state);
      return json(res, 200, { site, state });
    }
    if (req.method === "POST" && url.pathname === "/api/reset") {
      const state = seedState();
      await saveState(state);
      return json(res, 200, state);
    }
    if (req.method === "GET") {
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const safe = join(publicDir, path);
      if (!safe.startsWith(publicDir) || !existsSync(safe))
        return json(res, 404, { error: "Not found" });
      res.writeHead(200, {
        "content-type": mime[extname(safe)] || "application/octet-stream",
      });
      return res.end(await readFile(safe));
    }
    json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    json(res, 500, { error: error.message || "Unexpected error" });
  }
});

server.listen(port, () =>
  console.log(`Umbra is running at http://localhost:${port}`),
);
export { server, getState, validatePlan };
