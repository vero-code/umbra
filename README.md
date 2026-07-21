# Umbra

Umbra is an operations safety co-pilot for outdoor crews. It turns live UV/heat conditions, worksite context, crew exposure tiers, and optional site photos into a supervisor-approved rotation plan.

Umbra monitors the current operational state, but rebuilds recommendations only when new evidence is submitted or the supervisor requests a replan. The completed MVP flow is **Foreman profile → Team → External Factors → Behavioral Factors → Shift / Morning Brief**. Live Incident and Reports are intentionally disabled while the one-week demo concentrates on this core workflow.

## Run locally

Requires Node.js 20+.

```bash
npm run dev
```

Open `http://localhost:3000`. This is the React application. Its local API runs on
port `3001`; Vite proxies `/api` calls automatically. The default experience uses
reproducible seeded data and requires no API keys.

Port `3001` is API-only; it does not host a second UI.

Select **Refresh conditions** to retrieve hourly UV index, temperature, and cloud cover for each seeded site from Open-Meteo. If that provider is unavailable, Umbra retains and visibly records the last-known forecast instead of fabricating a result.

## Environmental exposure calculation

Umbra's deterministic planning dose index uses four visible inputs: the reported UV
Index, a time-of-day modifier (highest from 11:00–16:00), cloud-cover context, and
the site’s qualitative albedo modifier. Reflective surfaces use a 2.0× planning
multiplier; dense cloud cover (70%+) reduces the modifier, while light/intermittent
cloud has a small scattering-context modifier. The weather provider's UVI already
reflects sky conditions, so the cloud adjustment is deliberately modest to avoid
double-counting. This is an operational prioritization proxy, not a sunburn or
medical prediction.

## GPT-5.6 and deterministic demo reasoning

Codex and GPT-5.6 informed the product design, structured decision objects, and
multimodal evidence workflow. The runtime demo intentionally uses deterministic,
reproducible simulated assessments, so it needs no paid API key and never implies
that an unmade model call occurred. The safety engine remains authoritative: it
calculates the dose, ranks workers, and preserves the supervisor approval step.

## Demo path

1. Create the foreman profile and add the crew's self-reported risk context.
2. Upload two worksite photos and save the external dose assessment.
3. Place each worker on the site, select their PPE, SPF, and shade conditions, then apply the protection plan.
4. Open **Shift / Morning Brief** to see who should take the first protected break and why.
5. Approve the scheduled break while the map remains a truthful record of the last crew placement.

## Property evidence and crew placement

The external-factors view supports a multi-angle property submission with a supervisor-supplied location/work-zone description. Its deterministic demo assessment returns visually grounded operational observations: reflective materials such as concrete or glass, visible water, shade, and open exposure. Saving the assessment emits new evidence and recalculates the site's recommendation.

The site-positioning preview uses the selected property image as an interactive planning surface. Move the time slider to change the illustrative sun direction, drag crew icons, and review the relative exposure warning. It is a visual planning approximation, not an engineering-grade sun/shadow survey.

New team members can be added individually or from CSV. The individual form requires role, assigned site, operational priority tier, self-reported photosensitivity, and recent outdoor-exposure history. A workplace accommodation note and profile photo are optional; Umbra does not infer skin tone, health conditions, or medical status from an image.

## Safety boundary

Umbra is not medical advice, a legal compliance system, or an autonomous worker-management tool. A supervisor must approve each plan. Worker tiers are operational exposure-priority inputs, not health diagnoses.

## Codex and GPT-5.6

Codex and GPT-5.6 were used to create the MVP: the product workflow, structured evidence schema, multimodal assessment design, rules engine, React UI, API server, and documentation. At runtime, the hackathon demo uses the reproducible decision engine rather than making a paid API call. The model-inspired reasoning format never controls break constraints directly.

## Incremental implementation milestones

Umbra is delivered in reviewable milestones. Each milestone preserves the
working application before the next one is started:

- [x] Navigation and Shift / Morning Brief homepage
- [x] Recommendation and Evidence → Reasoning → Tradeoffs → Decision presentation
- [x] Evidence-triggered replanning and structured decision presentation
- [x] Worksite map with worker placement, shade zones, and planned relief route
- [x] Team roster and employee-profile workflow
- [x] External evidence intake and deterministic photo assessment
- [x] Behavioral protection and work-zone checklist
- [x] Deterministic, GPT-5.6-inspired reasoning fallback
- [ ] Live Incident and Reports (intentionally deferred for the hackathon MVP)
- [x] Visual hierarchy and responsive cleanup

For review, run the app after each milestone with `npm run dev`, walk the
corresponding navigation view, and confirm that previous views still load and
that only evidence-changing events or explicit scenarios replan operations.
