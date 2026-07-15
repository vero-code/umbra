import test from "node:test";
import assert from "node:assert/strict";
import {
  seedState,
  createPlan,
  validatePlan,
  scoreWorker,
  createEvent,
  processEvent,
  parseRosterCsv,
  addTeamMember,
  runAutonomousCycle,
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
test("events automatically replan affected sites and CSV imports valid workers", async () => {
  const state = seedState();
  const event = createEvent(state, "equipment_failed", {
    siteId: "site_north",
  });
  const decisions = await processEvent(state, event);
  assert.equal(event.status, "processed");
  assert.equal(decisions[0].status, "needs_review");
  assert.ok(
    decisions[0].reasoningChain.some((item) =>
      item.includes("Equipment failure"),
    ),
  );
  const imported = parseRosterCsv(
    "name,site,role,tier\nDrew Cole,West Yard,Loader,standard",
    state,
  );
  assert.equal(imported[0].siteId, "site_west");
  const member = addTeamMember(state, {
    name: "Kai Snow",
    siteId: "site_west",
    role: "Spotter",
    tier: "elevated",
    photosensitivity: "high",
    outdoorHistory: "regular",
  });
  assert.equal(member.exposureProfile.photosensitivity, "high");
});
test("autonomous cycle emits activity and produces a recommendation", async () => {
  const state = seedState();
  const cycle = await runAutonomousCycle(state);
  assert.equal(cycle.event.status, "processed");
  assert.ok(cycle.decisions.length > 0);
  assert.ok(state.activity.some((item) => item.phase === "reasoning"));
  assert.ok(cycle.decisions[0].alternative.includes("Alternative"));
});
