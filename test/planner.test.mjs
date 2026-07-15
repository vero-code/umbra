import test from "node:test";
import assert from "node:assert/strict";
import {
  seedState,
  createPlan,
  validatePlan,
  scoreWorker,
} from "../src/planner.mjs";
test("high-risk worker is prioritized and coverage remains", async () => {
  const state = seedState();
  const site = state.sites[0];
  const workers = state.workers.filter((w) => w.siteId === site.id);
  const plan = await createPlan(state, site.id, { useModel: false });
  assert.equal(plan.priorityWorkers[0].id, "w1");
  assert.equal(validatePlan(plan, workers).valid, true);
  assert.ok(scoreWorker(site, workers[0]) > scoreWorker(site, workers[1]));
});
