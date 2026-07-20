import { refreshForecast } from "./planner-workflows.mjs";

const strategicModel = () =>
  process.env.OPENAI_STRATEGIC_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-5.6-sol";
const routineModel = () => process.env.OPENAI_ROUTINE_MODEL || "gpt-5.6-luna";

export async function callOpenAI(input, model = routineModel()) {
  const data = await requestOpenAI({
    input,
    model,
    text: { format: { type: "json_object" } },
  });
  if (!data.output_text)
    throw new Error("OpenAI response did not include text");
  return JSON.parse(data.output_text);
}

async function requestOpenAI(payload) {
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is not configured");
  const { model = strategicModel(), ...request } = payload;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      ...request,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail}`);
  }
  return response.json();
}

export function getModelStatus() {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  return {
    configured,
    strategicModel: strategicModel(),
    routineModel: routineModel(),
    strategicUse:
      "Cross-site prioritization, incidents, what-if decisions, final recommendation reasoning",
    routineUse:
      "Photo summaries, timeline wording, low-risk classification, frequent status updates",
    approvedTools: [
      "refresh_weather",
      "read_worker_conditions",
      "read_photo_evidence",
      "simulate_worker_absence",
    ],
    mode: configured ? "live-ready" : "mock",
    detail: configured
      ? "A server-side API key is configured. No request is made until a model action is triggered."
      : "No API key is configured. Umbra is using deterministic mock model responses.",
  };
}

export async function testModelConnection() {
  const status = getModelStatus();
  if (!status.configured) {
    return {
      ...status,
      source: "mock",
      output_text:
        "Umbra mock response: GPT-5.6 connection is ready to test after OPENAI_API_KEY is configured.",
    };
  }
  const data = await requestOpenAI({
    model: strategicModel(),
    input:
      "Reply with exactly: Umbra GPT-5.6 connection confirmed. Do not add any other text.",
  });
  return {
    ...status,
    source: "OpenAI Responses API",
    responseId: data.id,
    output_text: data.output_text || "The API returned no text output.",
  };
}
export function buildEvidencePacket(site, plan, workers, event) {
  return {
    event: event
      ? {
          type: event.type,
          occurredAt: event.occurredAt,
          payload: event.payload,
        }
      : { type: "manual_review_requested" },
    site: {
      id: site.id,
      name: site.name,
      task: site.task,
      forecast: site.forecast,
      setting: site.setting,
      propertyAssessment: site.propertyAssessment || null,
      photoAssessment: site.photo
        ? {
            setting: site.photo.setting,
            confidence: site.photo.confidence,
            factors: site.photo.factors || [],
          }
        : null,
    },
    crew: workers.map((worker) => ({
      id: worker.id,
      name: worker.name,
      role: worker.role,
      tier: worker.tier,
      status: worker.status,
      behavioralFactors: worker.behavioralFactors || null,
    })),
    validatedPlan: {
      priorityWorkers: plan.priorityWorkers,
      rotationBlocks: plan.rotationBlocks,
      reasoningChain: plan.reasoningChain,
      alerts: plan.alerts,
      confidence: plan.confidence,
    },
  };
}

export function buildEvidenceAgentMock(packet, failed = false) {
  const first = packet.validatedPlan.priorityWorkers[0] || {
    id: "unassigned",
    name: "No assigned worker",
    tier: "unavailable",
  };
  const alternative = packet.validatedPlan.priorityWorkers[1] || first;
  const remainingCrewCount = Math.max(0, packet.crew.length - 1);
  const tradeoff = remainingCrewCount
    ? `${first.name}'s 20-minute relief break removes them from direct-exposure work; ${remainingCrewCount} other active crew ${remainingCrewCount === 1 ? "member remains" : "members remain"} assigned.`
    : "The relief break removes the only active worker from direct-exposure work, so supervisor coverage review is required.";
  const alternativeDecision =
    alternative.id !== first.id
      ? `Rotate ${alternative.name} first. This leaves ${first.name} in the higher-risk placement longer, so risk relief is lower.`
      : "No lower-risk alternate crew member is currently available.";
  return {
    source: failed ? "deterministic fallback" : "simulated evidence agent",
    mode: failed ? "fallback" : "mock",
    modelRole: failed ? "deterministic rules engine" : "GPT-5.6 Sol simulation",
    priorityWorkerId: first.id,
    decision: `Schedule ${first.name} for the first shaded relief break while other active crew remain assigned.`,
    triggeringEvent: packet.event.type.replaceAll("_", " "),
    evidence: packet.validatedPlan.reasoningChain,
    reasoning: [
      `${first.name} ranks first in the validated exposure calculation.`,
      "The agent cannot override break, coverage, or supervisor-review constraints.",
    ],
    tradeoffs: [tradeoff],
    alternative: {
      workerId: alternative.id,
      decision: alternativeDecision,
    },
    confidence: packet.validatedPlan.confidence,
    supervisorReviewRequired: true,
    toolCalls: [],
    uncertainty: failed
      ? [
          "Live GPT-5.6 reasoning was unavailable; deterministic evidence was retained.",
        ]
      : [
          "This is a clearly labeled deterministic mock; no live model call was made.",
        ],
  };
}

function normalizeEvidenceAgent(result, packet) {
  const fallback = buildEvidenceAgentMock(packet);
  const allowedIds = new Set(packet.crew.map((worker) => worker.id));
  const priorityWorkerId = allowedIds.has(result.priorityWorkerId)
    ? result.priorityWorkerId
    : fallback.priorityWorkerId;
  const alternativeWorkerId = allowedIds.has(result.alternative?.workerId)
    ? result.alternative.workerId
    : fallback.alternative.workerId;
  return {
    source: "GPT-5.6 evidence agent",
    mode: "live",
    modelRole: strategicModel(),
    priorityWorkerId,
    decision: String(result.decision || fallback.decision),
    triggeringEvent: String(result.triggeringEvent || fallback.triggeringEvent),
    evidence: Array.isArray(result.evidence)
      ? result.evidence.map(String).slice(0, 8)
      : fallback.evidence,
    reasoning: Array.isArray(result.reasoning)
      ? result.reasoning.map(String).slice(0, 6)
      : fallback.reasoning,
    tradeoffs: Array.isArray(result.tradeoffs)
      ? result.tradeoffs.map(String).slice(0, 4)
      : fallback.tradeoffs,
    alternative: {
      workerId: alternativeWorkerId,
      decision: String(
        result.alternative?.decision || fallback.alternative.decision,
      ),
    },
    confidence: ["low", "moderate", "high"].includes(
      String(result.confidence).toLowerCase(),
    )
      ? String(result.confidence).toLowerCase()
      : "moderate",
    supervisorReviewRequired: true,
    toolCalls: Array.isArray(result.toolCalls)
      ? result.toolCalls.map(String).slice(0, 6)
      : [],
    uncertainty: Array.isArray(result.uncertainty)
      ? result.uncertainty.map(String).slice(0, 4)
      : [],
  };
}

const evidenceAgentTools = [
  {
    type: "function",
    name: "refresh_weather",
    description:
      "Refresh the current weather provider snapshot for the active site.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "read_worker_conditions",
    description:
      "Read current roster, protection, and behavioral conditions for the active site.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "read_photo_evidence",
    description:
      "Read the existing visual evidence and uncertainty recorded from site and property photos.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "simulate_worker_absence",
    description:
      "Simulate a named active worker being unavailable. This is read-only and does not alter the roster.",
    parameters: {
      type: "object",
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
      additionalProperties: false,
    },
  },
];

async function runEvidenceTool(state, site, name, args) {
  if (name === "refresh_weather") {
    const result = await refreshForecast(site);
    return {
      approvedTool: name,
      refreshed: result.refreshed,
      forecast: site.forecast,
    };
  }
  if (name === "read_worker_conditions") {
    return {
      approvedTool: name,
      workers: state.workers
        .filter((worker) => worker.siteId === site.id)
        .map((worker) => ({
          id: worker.id,
          name: worker.name,
          status: worker.status,
          tier: worker.tier,
          behavioralFactors: worker.behavioralFactors || null,
        })),
    };
  }
  if (name === "read_photo_evidence") {
    return {
      approvedTool: name,
      sitePhoto: site.photo
        ? {
            visibleEvidence: site.photo.visibleEvidence || [],
            uncertainty: site.photo.uncertainty || [],
          }
        : null,
      propertyPhoto: site.propertyAssessment
        ? {
            visibleEvidence: site.propertyAssessment.visibleEvidence || [],
            uncertainty: site.propertyAssessment.uncertainty || [],
          }
        : null,
    };
  }
  if (name === "simulate_worker_absence") {
    const worker = state.workers.find(
      (entry) => entry.id === args.workerId && entry.siteId === site.id,
    );
    return worker
      ? {
          approvedTool: name,
          worker: worker.name,
          remainingActiveCrew: state.workers.filter(
            (entry) =>
              entry.siteId === site.id &&
              entry.status === "active" &&
              entry.id !== worker.id,
          ).length,
          note: "Read-only scenario; roster unchanged.",
        }
      : { approvedTool: name, error: "Worker is not active at this site." };
  }
  return { error: "Requested tool is not approved." };
}

export async function evidenceAgentDecision(state, site, packet) {
  const initialInput = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `You are Umbra's evidence agent. Review only supplied evidence and approved tool outputs. You may call an approved tool if needed; do not invent facts. Return exactly one JSON object with this schema: {priorityWorkerId:string, decision:string, triggeringEvent:string, evidence:string[], reasoning:string[], tradeoffs:string[], alternative:{workerId:string,decision:string}, confidence:"low"|"moderate"|"high", uncertainty:string[], toolCalls:string[]}. Do not make medical claims or override validatedPlan. Supervisor review is always required. ${JSON.stringify(packet)}`,
        },
      ],
    },
  ];
  let input = initialInput;
  let data;
  const toolCalls = [];
  for (let step = 0; step < 3; step += 1) {
    data = await requestOpenAI({
      model: strategicModel(),
      input,
      tools: evidenceAgentTools,
      tool_choice: "auto",
      text: { format: { type: "json_object" } },
    });
    const calls = (data.output || []).filter(
      (item) => item.type === "function_call",
    );
    if (!calls.length) break;
    const toolOutputs = await Promise.all(
      calls.map(async (call) => {
        const args = JSON.parse(call.arguments || "{}");
        toolCalls.push(call.name);
        return {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(
            await runEvidenceTool(state, site, call.name, args),
          ),
        };
      }),
    );
    input = [...initialInput, ...data.output, ...toolOutputs];
  }
  if (!data?.output_text)
    throw new Error("Evidence agent returned no JSON output");
  const result = JSON.parse(data.output_text);
  result.toolCalls = [...new Set(toolCalls)];
  return normalizeEvidenceAgent(result, packet);
}
