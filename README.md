# Umbra

Umbra is an operations safety co-pilot for outdoor crews. It turns live UV/heat conditions, worksite context, crew exposure tiers, and optional site photos into a supervisor-approved rotation plan.

Umbra continuously monitors the current operational state, but it rebuilds recommendations only when new evidence is submitted or an incident is explicitly reported. Use **Morning Brief** for the daily decision, **Live Incident** for event response, and **Planning Workspace** for preparation and the facility map. Reasoning is clearly labeled as simulated unless `OPENAI_API_KEY` is configured.

## Run locally

Requires Node.js 20+.

```bash
node server.mjs
```

Open `http://localhost:3000`. The default experience uses reproducible seeded data and requires no API keys.

Select **Refresh conditions** to retrieve hourly UV index, temperature, and cloud cover for each seeded site from Open-Meteo. If that provider is unavailable, Umbra retains and visibly records the last-known forecast instead of fabricating a result.

## Optional GPT-5.6 multimodal reasoning

Set `OPENAI_API_KEY` before running the server. Umbra then sends a constrained site snapshot and optional photo to the Responses API with `gpt-5.6` to enrich the human-readable rationale and classify a site photo. The deterministic rules engine remains the authoritative safety constraint layer; it validates crew coverage and break limits regardless of model availability.

```powershell
$env:OPENAI_API_KEY = 'your-key'
node server.mjs
```

No key is required for development. In that case, the model-status endpoint and
the test endpoint return an explicitly labeled, deterministic mock response:

```powershell
Invoke-RestMethod http://localhost:3000/api/model/status
Invoke-RestMethod -Method Post http://localhost:3000/api/model/test
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
