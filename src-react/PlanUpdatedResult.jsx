export default function PlanUpdatedResult({ result }) {
  if (!result) return null;
  return (
    <section className="planUpdatedResult" aria-live="polite">
      <div>
        <p className="eyebrow">PLAN UPDATED</p>
        <h3>{result.workerName}'s plan is ready.</h3>
      </div>
      <div className="planUpdatedStats">
        <span>
          <small>Placement</small>
          <b>{result.zone}</b>
        </span>
        <span>
          <small>Risk change</small>
          <b>
            {result.previousRisk} → {result.projectedRisk}
          </b>
        </span>
        <span>
          <small>Next rotation</small>
          <b>
            {result.nextBreak ||
              (result.priority ? `Priority #${result.priority}` : "Recomputed")}
          </b>
        </span>
      </div>
      <p>
        {result.reductionPercent > 0 &&
          `${result.reductionPercent}% reduction. `}
        {result.recommendation}
      </p>
      {result.reviewRequired && (
        <small className="approvalRequired">
          Supervisor approval remains required before the new rotation is
          treated as approved.
        </small>
      )}
    </section>
  );
}
