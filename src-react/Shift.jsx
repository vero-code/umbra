import { useMemo, useState } from "react";
import { api, useData } from "./umbra-data.js";
import { displayRotationBlocks } from "./rotation-display.js";
import "./Shift.css";
import "./ShiftMap.css";
import "./ShiftSignals.css";

const zoneLabels = {
  direct: "Direct sun",
  partial: "Partial shade",
  canopy: "Canopy / shaded zone",
};

const settingLabels = {
  shaded: "shaded",
  mixed: "mixed exposure",
  open: "open sky",
  uncertain: "unverified surface",
  reflective: "reflective surfaces",
};

const formatHour = (hour) => `${String(Number(hour) || 0).padStart(2, "0")}:00`;

const formatScore = (score) =>
  Number.isFinite(Number(score)) ? Number(score).toFixed(1) : "--";

const displayRole = (role) =>
  String(role || "Crew member")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const listNames = (names = []) => {
  if (names.length < 2) return names[0] || "";
  if (names.length === 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
};

const workerPosition = (worker, siteId) => {
  const position = worker?.behavioralFactors?.mapPosition;
  if (position?.siteId === siteId) return position;
  const shade = worker?.behavioralFactors?.shadeAvailability || "direct";
  return (
    {
      direct: { x: 51, y: 40 },
      partial: { x: 46, y: 58 },
      canopy: { x: 35, y: 76 },
    }[shade] || { x: 51, y: 40 }
  );
};

const primaryPlan = (plans = [], portfolio = [], workers = []) => {
  const activeWorkerIds = new Set(
    workers
      .filter((worker) => worker.status === "active")
      .map((worker) => worker.id),
  );
  const validPlans = [...plans].filter((plan) =>
    plan?.priorityWorkers?.some((worker) => activeWorkerIds.has(worker.id)),
  );
  const prioritySiteId = [...portfolio].sort(
    (first, second) =>
      (first.rank || Number.MAX_SAFE_INTEGER) -
        (second.rank || Number.MAX_SAFE_INTEGER) ||
      Number(second.exposureScore || 0) - Number(first.exposureScore || 0),
  )[0]?.siteId;
  const sitePlans = prioritySiteId
    ? validPlans.filter((plan) => plan.siteId === prioritySiteId)
    : validPlans;
  const candidatePlans = sitePlans.length ? sitePlans : validPlans;

  return (
    candidatePlans.sort(
      (first, second) =>
        new Date(second.createdAt || 0) - new Date(first.createdAt || 0),
    )[0] || null
  );
};

const scheduledBreakLabel = (worker) =>
  worker?.behavioralFactors?.shadeAvailability === "canopy"
    ? "relief check-in"
    : "shaded relief break";

const scheduledCrew = (workers = [], siteId, block) => {
  const remaining = workers.filter(
    (worker) =>
      worker.siteId === siteId &&
      worker.status === "active" &&
      !block.workers.includes(worker.id),
  );
  const count = remaining.length;
  return {
    count,
    names: listNames(remaining.map((worker) => worker.name)),
    text: count
      ? `${count} active crew ${count === 1 ? "member remains" : "members remain"} assigned`
      : "Supervisor coverage review required",
  };
};

const protectionSummary = (worker) => {
  const factors = worker?.behavioralFactors;
  if (!factors) return "PPE, SPF, and shade status have not been recorded.";
  const ppe =
    {
      cotton: "cotton tee",
      visor: "visor + workwear",
      upf50: "UPF 50+ workwear",
    }[factors.upf] || "unrecorded PPE";
  const spf =
    {
      none: "no SPF",
      spf30: "SPF 30",
      spf50: "SPF 50",
    }[factors.spf] || "unrecorded SPF";
  return `${ppe}, ${spf}, ${zoneLabels[factors.shadeAvailability] || "unrecorded placement"}.`;
};

function WorksiteMap({
  site,
  priorityWorker,
  workers,
  environment,
  nextRotation,
}) {
  const image = site?.propertyPhotos?.[0]?.image || site?.photo?.image;
  const sunHour =
    site?.propertyAssessment?.exposure?.hour ??
    site?.forecast?.localHour ??
    environment?.hour;
  const crewOnSite = workers.filter(
    (worker) => worker.siteId === site?.id && worker.status === "active",
  );
  const visibleCrew = [
    priorityWorker,
    ...crewOnSite.filter((worker) => worker.id !== priorityWorker?.id),
  ]
    .filter(Boolean)
    .slice(0, 5);
  const markerOffsets = [
    [0, 0],
    [-25, 18],
    [25, 18],
    [-24, -17],
    [25, -17],
  ];
  const placedCrew = visibleCrew.map((member, index) => {
    const basePosition = workerPosition(member, site?.id);
    const sharedPositionIndex = visibleCrew
      .slice(0, index)
      .filter((otherMember) => {
        const otherPosition = workerPosition(otherMember, site?.id);
        return (
          Math.abs(otherPosition.x - basePosition.x) < 4 &&
          Math.abs(otherPosition.y - basePosition.y) < 4
        );
      }).length;
    const [offsetX, offsetY] = markerOffsets[sharedPositionIndex] || [0, 0];

    return {
      member,
      position: {
        x: Math.min(92, Math.max(7, basePosition.x + offsetX)),
        y: Math.min(88, Math.max(8, basePosition.y + offsetY)),
      },
      shade: member.behavioralFactors?.shadeAvailability || "direct",
      isPriority: member.id === priorityWorker?.id,
    };
  });
  const priorityPlacement = placedCrew.find((entry) => entry.isPriority);
  const reliefTarget = { x: 54, y: 76 };
  const reliefMinutes = nextRotation?.breakMinutes || 20;
  const isAlreadyInShade = priorityPlacement?.shade === "canopy";

  return (
    <article className="shiftMapCard">
      <div className="shiftSectionHeading">
        <div>
          <p className="eyebrow">CURRENT PLACEMENT &amp; RELIEF ROUTE</p>
          <h2>
            {site?.propertyObjectName || site?.name || "Assigned worksite"}
          </h2>
        </div>
        <span className="shiftMapTime">Sun · {formatHour(sunHour)}</span>
      </div>
      <div className="shiftStaticMap">
        {image ? (
          <img
            src={image}
            alt={`${site?.name || "Worksite"} placement summary`}
          />
        ) : (
          <div
            className="shiftMapFallback"
            aria-label="Neutral worksite schematic"
          />
        )}
        <div className="shiftMapOverlay" aria-hidden="true" />
        <span className="shiftMapZone shiftDirectZone">Direct sun</span>
        <span className="shiftMapZone shiftCanopyZone">Shaded relief zone</span>
        {!isAlreadyInShade && priorityPlacement && (
          <>
            <svg
              className="shiftReliefRoute"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="shift-relief-arrow"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" />
                </marker>
              </defs>
              <path
                d={`M ${priorityPlacement.position.x} ${priorityPlacement.position.y} L ${reliefTarget.x} ${reliefTarget.y}`}
                markerEnd="url(#shift-relief-arrow)"
              />
            </svg>
          </>
        )}
        {placedCrew.map(({ member, position, shade, isPriority }) => (
          <span
            key={member.id}
            className={`shiftMapCrewMarker ${isPriority ? "isPriority" : ""}`}
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            title={`${member.name} — ${zoneLabels[shade] || "Current placement"}`}
            aria-label={`${member.name}: ${zoneLabels[shade] || "Current placement"}`}
          >
            <span className="crewInitial figurine builder" aria-hidden="true">
              <i />
              <em />
            </span>
            {isPriority && <b aria-hidden="true">1</b>}
          </span>
        ))}
      </div>
      <ul className="shiftMapCrewLegend" aria-label="Crew placement summary">
        {placedCrew.map(({ member, shade, isPriority }) => (
          <li key={member.id} className={isPriority ? "isPriority" : ""}>
            <span className="shiftMapLegendAvatar" aria-hidden="true">
              {member.name?.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span>
              <b>{member.name}</b>
              <small>
                {isPriority ? "First out · " : ""}
                {zoneLabels[shade] || "Current placement"}
              </small>
            </span>
          </li>
        ))}
      </ul>
      <p className="shiftMapInstruction">
        <b>{isAlreadyInShade ? "Placement:" : "Scheduled route:"}</b>{" "}
        {priorityWorker?.name || "Priority worker"}{" "}
        {isAlreadyInShade
          ? "is already in the shaded zone"
          : "is scheduled to move from"}{" "}
        {!isAlreadyInShade &&
          `${zoneLabels[priorityPlacement?.shade] || "their current zone"} to the shaded relief zone`}{" "}
        at {nextRotation?.window?.split("-")[0] || "the next rotation"} for{" "}
        {reliefMinutes} minutes.
      </p>
      <p className="shiftMapCaption">
        Dashed route = planned move into the shaded relief zone. Gold marker =
        first out. Current markers remain unchanged until a crew position
        check-in is recorded.
      </p>
    </article>
  );
}

function RotationRows({ plan, workers, site, environment }) {
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const priorityById = new Map(
    plan.priorityWorkers.map((worker, index) => [worker.id, index + 1]),
  );
  const scoreByWorkerId = new Map(
    plan.priorityWorkers.map((worker) => [worker.id, worker.score]),
  );
  const rotationBlocks = displayRotationBlocks(
    plan.rotationBlocks,
    site,
    environment,
  );

  return (
    <article className="shiftRotations">
      <div className="shiftSectionHeading">
        <div>
          <p className="eyebrow">TODAY'S ROTATION PLAN</p>
          <h2>Scheduled protected breaks</h2>
        </div>
        <span>{rotationBlocks.length} scheduled windows</span>
      </div>
      <div
        className="shiftRotationTable"
        role="table"
        aria-label="Break rotations"
      >
        <div className="shiftRotationHeader" role="row">
          <span role="columnheader">When</span>
          <span role="columnheader">Scheduled break</span>
          <span role="columnheader">Why</span>
          <span role="columnheader">Crew assigned</span>
        </div>
        {rotationBlocks.map((block, index) => {
          const people = block.workers
            .map((workerId) => workerById.get(workerId))
            .filter(Boolean);
          const priority = people
            .map((worker) => priorityById.get(worker.id))
            .filter(Boolean)
            .sort((first, second) => first - second)[0];
          const crew = scheduledCrew(workers, site?.id, block);
          return (
            <div
              className="shiftRotationRow"
              role="row"
              key={`${block.window}-${index}`}
            >
              <b role="cell">{block.window}</b>
              <span role="cell" className="shiftRotationAction">
                <b>
                  {people.length
                    ? people.map((worker) => worker.name).join(", ")
                    : "Crew assignment pending"}
                </b>
                <small>
                  {people.length === 1
                    ? scheduledBreakLabel(people[0])
                    : "shaded relief break"}
                </small>
              </span>
              <span role="cell" className="shiftRotationReason">
                {priority === 1
                  ? `Highest score · ${formatScore(
                      scoreByWorkerId.get(people[0]?.id),
                    )}`
                  : priority
                    ? `Priority #${priority} compliance rotation`
                    : "Scheduled compliance rotation"}
              </span>
              <span
                role="cell"
                className={`shiftCoverage ${index === 0 ? "isNext" : ""}`}
              >
                {index === 0 && <em>Next</em>}
                {crew.text}
              </span>
            </div>
          );
        })}
      </div>
      <p className="shiftRotationCaption">
        Future breaks are replanned when weather, site evidence, crew placement,
        or availability changes.
      </p>
    </article>
  );
}

function ReasoningChain({ decision, plan, site, worker }) {
  const environment = plan.environmentalExposure || {};
  const materials = site?.propertyAssessment?.reflectiveMaterials || [];
  const surfaceEvidence = materials.length
    ? materials.join(", ")
    : settingLabels[site?.setting] || "site setting unrecorded";
  const evidence = [
    `UVI ${environment.baseUvi ?? "--"} · ${site?.forecast?.temperatureC ?? "--"}°C · ${environment.cloudCover ?? "--"}% cloud · ${formatHour(environment.hour)}.`,
    `Site exposure: ${surfaceEvidence}; ${environment.albedoFactor ?? "--"}× surface multiplier.`,
    `Worker protection: ${protectionSummary(worker)}`,
  ];
  const reasoning = [
    decision?.whyWorker ||
      `${worker?.name || "The priority worker"} has the highest modeled exposure score at this site.`,
    decision?.whyNow ||
      plan.alerts?.[0] ||
      "The current conditions require a rotation decision.",
  ];
  const breakMinutes = plan.rotationBlocks?.[0]?.breakMinutes || 20;
  const remainingCrewCount = Math.max(0, plan.priorityWorkers.length - 1);
  const tradeoffSummary = remainingCrewCount
    ? `${worker?.name || "The priority worker"}'s ${breakMinutes}-minute relief break removes them from direct-exposure work; ${remainingCrewCount} other active crew ${remainingCrewCount === 1 ? "member remains" : "members remain"} assigned.`
    : "The relief break removes the only active worker from direct-exposure work, so supervisor coverage review is required.";
  const alternativeWorker = plan.priorityWorkers?.[1];
  const alternativeSummary = alternativeWorker
    ? `Alternative: rotate ${alternativeWorker.name} first. That leaves ${worker?.name || "the higher-risk worker"} in direct sun longer, so it provides lower risk relief.`
    : "No lower-risk alternate crew member is currently available.";
  const tradeoffs = [tradeoffSummary, alternativeSummary];
  const conditionSummary = `UVI ${environment.baseUvi ?? "--"} at ${formatHour(environment.hour)} with ${environment.albedoFactor ?? "--"}× surface exposure.`;
  const workerRiskSummary =
    decision?.whyWorker ||
    `${worker?.name || "Priority worker"} has the highest modeled exposure score at this site.`;
  const evidenceDetails = [...evidence, ...reasoning, ...tradeoffs];

  return (
    <section className="shiftReasoning" aria-label="Why Umbra chose this plan">
      <div className="shiftReasoningHeading">
        <div>
          <p className="eyebrow">WHY UMBRA CHOSE THIS PLAN</p>
          <h2>Why this rotation is the safest next move</h2>
        </div>
        <span>{plan.confidence || "Operational confidence recorded"}</span>
      </div>
      <div className="shiftReasoningGrid">
        <article className="shiftReasoningCard evidence">
          <p>CONDITIONS</p>
          <strong>{conditionSummary}</strong>
          <small>
            {surfaceEvidence}; the planning engine applies the recorded surface
            multiplier.
          </small>
        </article>
        <article className="shiftReasoningCard tradeoffs">
          <p>OPERATIONAL TRADE-OFF</p>
          <strong>{tradeoffSummary}</strong>
          <small>{alternativeSummary}</small>
        </article>
        <article className="shiftReasoningCard reasoning">
          <p>WORKER RISK</p>
          <strong>{workerRiskSummary}</strong>
          <small>{protectionSummary(worker)}</small>
        </article>
      </div>
      <details className="shiftReasoningDetails">
        <summary>View evidence used for this decision</summary>
        <ul>
          {evidenceDetails.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export default function Shift() {
  const { profile, state, setState } = useData();
  const [isApproving, setIsApproving] = useState(false);
  const [message, setMessage] = useState("");
  const plan = useMemo(
    () => primaryPlan(state?.plans, state?.portfolio, state?.workers),
    [state?.plans, state?.portfolio, state?.workers],
  );
  const site = state?.sites?.find((entry) => entry.id === plan?.siteId);
  const priority = plan?.priorityWorkers?.[0];
  const worker = state?.workers?.find((entry) => entry.id === priority?.id);
  const storedDecision = state?.decisions?.find(
    (entry) => entry.planId === plan?.id,
  );
  const decision =
    storedDecision ||
    (plan
      ? {
          whyWorker: `${priority?.name || "The priority worker"} has the highest exposure score (${formatScore(priority?.score)}) at this site.`,
          whyNow:
            plan.alerts?.[0] ||
            "Exposure conditions require the next protected break.",
          operationalImpact: plan.evidenceAgent?.tradeoffs?.[0],
          alternative: plan.evidenceAgent?.alternative?.decision,
          confidence: plan.confidence,
        }
      : null);
  const isApproved = plan?.status === "approved";
  const environment = plan?.environmentalExposure || {};
  const rotationBlocks = displayRotationBlocks(
    plan?.rotationBlocks || [],
    site,
    environment,
  );
  const nextRotation = rotationBlocks[0];
  const currentZone =
    zoneLabels[worker?.behavioralFactors?.shadeAvailability] ||
    "Recorded work zone";
  const coverageCrew = (state?.workers || []).filter(
    (entry) =>
      entry.siteId === site?.id &&
      entry.status === "active" &&
      entry.id !== worker?.id,
  );
  const coverageNames = listNames(coverageCrew.map((entry) => entry.name));
  const coverageCount = coverageCrew.length;
  const nextRotationCopy = nextRotation
    ? `${nextRotation.breakMinutes} minute rotation starts at ${nextRotation.window.split("-")[0]}.`
    : "The next protected rotation is ready to start.";
  const priorityInShade =
    worker?.behavioralFactors?.shadeAvailability === "canopy";
  const startTime = nextRotation?.window?.split("-")[0] || "the next window";
  const endTime = nextRotation?.window?.split("-")[1] || "";
  const actionCopy = priorityInShade
    ? `${worker?.name || priority.name} should take a relief break at ${startTime}.`
    : `${worker?.name || priority.name} should leave direct sun at ${startTime}.`;

  const approvePlan = async () => {
    if (!plan || isApproved) return;
    try {
      setIsApproving(true);
      setMessage("Recording supervisor approval...");
      const data = await api("/api/shift/approve", {
        method: "POST",
        body: JSON.stringify({ profile, planId: plan.id }),
      });
      if (data.state) setState(data.state);
      setMessage(
        `Break approved for ${nextRotation?.window || "the next window"}. The map remains on the last crew check-in until ${worker?.name || priority?.name || "the worker"}'s position is updated.`,
      );
    } catch (error) {
      setMessage(error.message || "Unable to approve the morning plan.");
    } finally {
      setIsApproving(false);
    }
  };

  if (!state) {
    return (
      <main className="reactWorkspace shiftWorkspace">
        <section className="shiftEmptyState">
          <p className="eyebrow">SHIFT / MORNING BRIEF</p>
          <h1>Loading the current shift plan…</h1>
        </section>
      </main>
    );
  }

  if (!plan || !priority) {
    return (
      <main className="reactWorkspace shiftWorkspace">
        <section className="shiftEmptyState">
          <p className="eyebrow">SHIFT / MORNING BRIEF</p>
          <h1>A morning plan is not ready yet.</h1>
          <p>
            Record external conditions and apply at least one protection update.
            Umbra will then build the crew's first validated rotation plan.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="reactWorkspace shiftWorkspace">
      <section className="shiftHero">
        <div>
          <p className="eyebrow">SHIFT / MORNING BRIEF</p>
          <h1>
            {isApproved
              ? `${worker?.name || priority.name}'s relief break is approved.`
              : actionCopy}
          </h1>
          <p className="shiftHeroSummary">
            {nextRotationCopy}{" "}
            {coverageCount
              ? `${coverageCount} active crew ${coverageCount === 1 ? "member remains" : "members remain"} assigned to the site.`
              : "Supervisor coverage review is required."}
          </p>
        </div>
        <aside
          className={`shiftPlanStatus ${isApproved ? "approved" : "review"}`}
        >
          <p className="eyebrow">NEXT ACTION</p>
          <b>
            {isApproved
              ? `Approved — awaiting ${startTime} check-in`
              : `Approve the ${nextRotation?.window || "next"} break`}
          </b>
          <span>
            {isApproved
              ? `${worker?.name || priority.name} is scheduled for ${startTime}${endTime ? `–${endTime}` : ""}. Current placement remains ${currentZone} until crew check-in.`
              : `${worker?.name || priority.name} is scheduled to move from ${currentZone} to shaded relief at ${startTime}.`}
          </span>
        </aside>
      </section>

      <section className="shiftDecisionGrid">
        <article className="shiftPriorityCard">
          <div className="shiftPriorityHeading">
            <div>
              <p className="eyebrow">WHY THIS WORKER</p>
              <h2>{worker?.name || priority.name}</h2>
              <small>{displayRole(worker?.role || priority.role)}</small>
            </div>
            <span className="shiftScore">
              <small>Exposure score</small>
              <b>{formatScore(priority.score)}</b>
            </span>
          </div>
          <div className="shiftPriorityFacts">
            <span>
              <small>Current zone</small>
              <b>{currentZone}</b>
            </span>
            <span>
              <small>Scheduled break</small>
              <b>
                {priorityInShade ? "Relief check-in" : "Shaded relief"} ·{" "}
                {nextRotation?.breakMinutes || 20} min
              </b>
            </span>
            <span>
              <small>Scheduled window</small>
              <b>{nextRotation?.window || "Ready to schedule"}</b>
            </span>
            <span>
              <small>Why now</small>
              <b>
                {decision?.whyNow || plan.alerts?.[0] || "Exposure threshold"}
              </b>
            </span>
          </div>
          <div className="shiftRiskSignals" aria-label="Immediate risk signals">
            <span>
              <small>UVI</small>
              <b>{environment.baseUvi ?? "--"}</b>
            </span>
            <span>
              <small>Conditions time</small>
              <b>{formatHour(environment.hour)}</b>
            </span>
            <span>
              <small>Albedo</small>
              <b>
                {site?.setting === "reflective" ? "Reflective" : "Surface"}
                {` · ${environment.albedoFactor ?? "--"}×`}
              </b>
            </span>
          </div>
          <div className="shiftAction">
            <p>
              Approval records {worker?.name || priority.name}'s scheduled
              break; it does not change their current map position.{" "}
              {coverageNames && `${coverageNames} remain assigned to the site.`}
            </p>
            <button
              type="button"
              className="shiftApproveButton"
              disabled={isApproved || isApproving}
              onClick={approvePlan}
            >
              {isApproved
                ? "Break approved — awaiting check-in"
                : isApproving
                  ? "Approving scheduled break…"
                  : `Approve ${nextRotation?.window || "scheduled"} break`}
            </button>
            {message && (
              <small className="shiftApprovalMessage">{message}</small>
            )}
          </div>
        </article>

        <WorksiteMap
          site={site}
          priorityWorker={worker}
          workers={state.workers || []}
          environment={environment}
          nextRotation={nextRotation}
        />
      </section>

      <RotationRows
        plan={plan}
        workers={state.workers || []}
        site={site}
        environment={environment}
      />
      <ReasoningChain
        decision={decision}
        plan={plan}
        site={site}
        worker={worker}
      />
    </main>
  );
}
