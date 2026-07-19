# Umbra

Umbra is an operations safety co-pilot for outdoor crews. It turns live UV/heat conditions, worksite context, crew exposure tiers, and optional site photos into a supervisor-approved rotation plan.

Umbra continuously monitors the current operational state, but it rebuilds recommendations only when new evidence is submitted or an incident is explicitly reported. Use **Morning Brief** for the daily decision, **Live Incident** for event response, and **Planning Workspace** for preparation and the facility map. Reasoning is clearly labeled as simulated unless `OPENAI_API_KEY` is configured.

## Run locally

Requires Node.js 20+.

```bash
npm run dev
```

Open `http://localhost:3000`. This is the React application. Its local API runs on
port `3001`; Vite proxies `/api` calls automatically. The default experience uses
reproducible seeded data and requires no API keys.

`npm run dev:legacy` remains available only as a temporary archive of the native
JavaScript implementation. It is not the active product UI.

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

## Optional GPT-5.6 multimodal reasoning

Set `OPENAI_API_KEY` before running the server. Umbra then sends a constrained site snapshot and optional photo to the Responses API with `gpt-5.6` to enrich the human-readable rationale and classify a site photo. The deterministic rules engine remains the authoritative safety constraint layer; it validates crew coverage and break limits regardless of model availability.

Umbra uses a cost-aware model split: strategic cross-site Evidence Agent decisions
default to `gpt-5.6` (Sol), while routine photo/property summaries default to
`gpt-5.6-luna`. Override them with `OPENAI_STRATEGIC_MODEL` and
`OPENAI_ROUTINE_MODEL` when needed.

```powershell
$env:OPENAI_API_KEY = 'your-key'
node server.mjs
```

No key is required for development. In that case, the model-status endpoint and
the test endpoint return an explicitly labeled, deterministic mock response:

```powershell
Invoke-RestMethod http://localhost:3001/api/model/status
Invoke-RestMethod -Method Post http://localhost:3001/api/model/test
```

At the end of the hackathon, set the key and repeat the second command. It makes
one small live `gpt-5.6` Responses API request and should return `Umbra GPT-5.6
connection confirmed.` The key stays server-side and is never sent to the browser.

## Demo path

1. Generate the plan for **North Tower Roof**.
2. Note Maya’s first-out priority and the reflective-surface alert.
3. Select **Simulate UV / heat spike** and show the updated conditions and replan.
4. Optionally upload a worksite image; in demo mode it is safely classified as requiring review, while with an API key GPT-5.6 classifies shade/reflectivity context.
5. Approve the generated plan and show the audit trail.

## Property evidence and crew placement

The executive view supports a multi-angle property submission with a supervisor-supplied location/work-zone description. With GPT-5.6 credentials, the assessment returns only visually grounded operational observations: reflective materials such as concrete or glass, visible water, shade, and open exposure. A new event is emitted and Umbra automatically recalculates the site's recommendation.

The site-positioning preview uses the selected property image as an interactive planning surface. Move the time slider to change the illustrative sun direction, drag crew icons, and review the relative exposure warning. It is a visual planning approximation, not an engineering-grade sun/shadow survey.

New team members can be added individually or from CSV. The individual form requires role, assigned site, operational priority tier, self-reported photosensitivity, and recent outdoor-exposure history. A workplace accommodation note and profile photo are optional; Umbra does not infer skin tone, health conditions, or medical status from an image.

## Safety boundary

Umbra is not medical advice, a legal compliance system, or an autonomous worker-management tool. A supervisor must approve each plan. Worker tiers are operational exposure-priority inputs, not health diagnoses.

## Codex and GPT-5.6

Codex was used to create the full working MVP: the product UI, rules engine, validation tests, API server, and documentation. GPT-5.6 is integrated through the Responses API to reason over structured live-condition context and site-photo inputs, returning constrained explanatory insight. Model output never controls break constraints directly.

## Incremental implementation milestones

Umbra is delivered in reviewable milestones. Each milestone preserves the
working application before the next one is started:

- [x] Navigation and Shift / Morning Brief homepage
- [x] Recommendation and Evidence → Reasoning → Tradeoffs → Decision presentation
- [x] Agent-style event stream language and evidence-triggered replanning
- [x] Ranked Sites operational portfolio
- [x] Facility map with fallback schematic, sun slider, shade zones, and placement warnings
- [x] Team status view
- [x] Secondary employee-profile drawer
- [x] External evidence intake and timeline
- [x] Behavioral protection checklist
- [x] Read-only What-if planner
- [x] B2B operational Reports
- [x] GPT-5.6 Sol/Luna routing with deterministic fallback
- [x] Visual hierarchy and responsive cleanup

For review, run the app after each milestone with `npm run dev`, walk the
corresponding navigation view, and confirm that previous views still load and
that only evidence-changing events or explicit scenarios replan operations.
