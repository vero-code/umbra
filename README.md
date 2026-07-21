# Umbra

Umbra is a B2B UV-safety planning MVP for outdoor crews. It turns worksite evidence, current weather, self-reported worker context, PPE, sunscreen, and shade placement into an explainable, supervisor-approved relief plan.

It was built for the OpenAI Build Week **Work and Productivity** track. The product question is simple: **who should leave direct sun first, when, and why?**

## Built with Codex and GPT-5.6

Umbra was created end to end with Codex and GPT-5.6 during OpenAI Build Week: from the original product concept and system architecture through the React interface, Node.js API, deterministic safety engine, image-assessment demo, workflow design, debugging, and documentation.

Development used:

- the Codex desktop app on Windows 11 for the initial build;
- the **Codex – OpenAI's coding agent** extension in Visual Studio Code for later development;
- GPT-5.6 Terra as the primary development model, with GPT-5.6 Luna used when Terra was unavailable;
- progressively deeper reasoning effort: **Light**, then **High**, then **Ultra**, as the workflow, data model, and implementation became more complex.

All available hackathon Codex credits were used to build and refine the project. Thank you to the organizers for the opportunity to test Codex and GPT-5.6 in a complete product workflow.

## What the MVP does

Umbra guides a foreman through one operational workflow:

1. **Create a foreman profile** — a foreman name and company create a local team workspace.
2. **Build the team** — add, edit, or remove employee profiles with age, self-reported sensitivity, self-reported Fitzpatrick skin type, optional occupational-health markers, and acknowledgement.
3. **Assess external factors** — add an object name, location, optional notes, and at least two site photos. Umbra retrieves current weather where possible, evaluates the recorded site context, and calculates the planning dose.
4. **Set protection and placement** — for every crew member, record PPE/UPF, SPF, time since application, shade access, and a position on the worksite image.
5. **Review the Morning Brief** — Umbra ranks exposure risk, schedules protected 20-minute relief breaks, shows the planned relief route, explains the decision, and asks for supervisor approval.

The current UI intentionally keeps **Live Incident** and **Reports** disabled. They are planned follow-on areas, not claimed as completed MVP features.

## Decision model

The deterministic exposure engine is authoritative. It calculates the planning external dose as:

```text
dose index = UV index × sun/time factor × cloud factor × albedo factor
```

It applies these operational rules:

- Peak sun window, 11:00–16:00: `1.35×`
- Shoulder windows, 09:00–11:00 and 16:00–17:00: `1.08×`
- Other hours: `0.65×`
- Light cloud or haze: `1.08×`; 50–69% cloud cover: `0.75×`; dense cloud cover reduces the factor toward `0.1×`
- Surface settings: shaded `0.85×`, mixed `1.1×`, open `1.2×`, uncertain `1.25×`, reflective `2×`

The worker score additionally considers heat, crew availability, self-reported age/sensitivity/Fitzpatrick context, PPE/UPF, SPF freshness, and shade. A plan cannot rotate the whole active crew out at once, and rotations are at least 15 minutes long.

Umbra is operational decision support, not a medical diagnosis, legal guarantee, or replacement for site safety judgement. Medical markers remain self-reported occupational-health context; no physiological traits are inferred from a photo.

## Explainability and approval

Every Morning Brief exposes the reasoning behind its next break:

- site conditions: UV, temperature, cloud cover, time, materials, and albedo;
- worker risk: current protection and placement;
- operational trade-off: the proposed relief versus a lower-risk alternative and remaining crew availability;
- decision: who is scheduled to enter shaded relief, for how long, and why now.

Supervisor approval records the scheduled break. It does not silently move a worker marker; map positions represent a separate crew position check-in.

## Architecture

For the complete runtime, data-flow, API, and module-level design, see [ARCHITECTURE.md](ARCHITECTURE.md).

```text
React + Vite UI (:3000)
        │ /api proxy
        ▼
Node.js ESM API (:3001)
        ├── deterministic exposure, rotation, event, and evidence modules
        ├── local JSON persistence for teams, objects, and operations
        ├── Open-Meteo forecast refresh with a safe fallback
        └── optional OpenAI Responses API integration
```

### Technology stack

- React 19, React Router, Zustand, and Vite
- Node.js native HTTP server using ES modules
- Open-Meteo for weather refreshes
- Local JSON files for the demo persistence layer
- Optional OpenAI Responses API integration with structured JSON and approved server-side tools

## Local development

Prerequisite: Node.js 20 or later.

```bash
npm install
npm run dev
```

`npm run dev` starts both processes:

| Service   | URL                     | Purpose                                                  |
| --------- | ----------------------- | -------------------------------------------------------- |
| React UI  | `http://localhost:3000` | The Umbra application                                    |
| Local API | `http://localhost:3001` | Planning, persistence, weather, and optional model calls |

The Vite UI proxies `/api/*` requests to port `3001`. Port `3001` is the API service only; it does not serve the React app.

Other useful commands:

```bash
npm run dev:ui    # Vite UI only, port 3000
npm run dev:api   # Node API only, port 3001
npm run build     # production frontend build into dist/
```

## Demo and sample data

No separate sample-data download is required. A fresh clone starts with the foreman onboarding screen, an empty team, and seeded template worksites for the guided demo flow.

- `data/workers.example.json` documents the local team-data shape.
- `data/objects.example.json` documents the saved object-evidence shape.
- Add your own two worksite photos in **External Factors** to create a real demo assessment record for the local workspace.

Runtime data is created locally as you use the app and is intentionally excluded from Git; see [Persistence and privacy](#persistence-and-privacy).

## OpenAI and demo modes

The app runs without an API key.

- **No API key:** Umbra uses the deterministic safety engine and a reproducible demo assessment for supplied worksite evidence. It must not be interpreted as live GPT-5.6 Vision analysis.
- **With a server-side API key:** the API can use the OpenAI Responses API for structured evidence and vision assessments. The configured defaults are `gpt-5.6-sol` for strategic cross-site reasoning and `gpt-5.6-luna` for routine/vision work.

The browser never receives an OpenAI key. Set the following variables in the environment that starts the API if live integration is enabled:

```text
OPENAI_API_KEY=...
OPENAI_STRATEGIC_MODEL=gpt-5.6-sol
OPENAI_ROUTINE_MODEL=gpt-5.6-luna
```

The model can only request approved server tools: refresh weather, read worker conditions, read photo evidence, or run a read-only absence simulation. The deterministic plan is created first and remains the safety constraint; model output may explain or compare a plan, but cannot override it.

## Persistence and privacy

Umbra currently has no database or authentication. It is a local demo with JSON persistence:

| File                | Contents                                                                             |
| ------------------- | ------------------------------------------------------------------------------------ |
| `data/workers.json` | Foreman/team records, employee profiles, events, decisions, plans, and audit history |
| `data/objects.json` | Saved worksite evidence, forecasts, assessments, and uploaded image data             |
| `data/umbra.json`   | Shared local agent metadata and base state                                           |

Those runtime files are intentionally ignored by Git, as is `.env`. The committed `data/*.example.json` files describe the expected shapes. A matching foreman name and company restore the same local team on that machine; this is not production authentication or multi-tenant isolation.

Because these files can contain uploaded site photos and self-reported occupational-health context, do not commit or share them casually.

## Project structure

```text
src-react/       React screens, workflow navigation, maps, and UI styles
src/             deterministic planner, evidence, vision, and workflow modules
server.mjs       local Node API and JSON persistence
data/            example schemas plus ignored runtime data
test/            Node planner and API integration tests
```

## Current scope

This MVP demonstrates a structured evidence-to-decision workflow for construction, agriculture, courier, delivery, and other outdoor operations. Before production use it would need authenticated accounts, a proper database, tenant isolation, secure image storage, permission controls, audit/export workflows, and formal safety/compliance review.
