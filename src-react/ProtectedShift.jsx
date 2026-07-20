import Shift from "./Shift.jsx";
import {
  hasCompleteCrewPlacement,
  protectionPlanKey,
  useUmbra,
} from "./umbra-data.js";
import "./Shift.css";

export default function ProtectedShift() {
  const profile = useUmbra((store) => store.profile);
  const state = useUmbra((store) => store.state);
  const hasAppliedProtectionPlan = Boolean(
    localStorage.getItem(protectionPlanKey(profile)),
  );
  const hasPlacedEveryCrewMember = hasCompleteCrewPlacement(state);

  if (!state) return null;

  if (!hasPlacedEveryCrewMember) {
    return (
      <main className="shiftWorkspace">
        <section className="shiftEmptyState">
          <p className="eyebrow">MORNING BRIEF LOCKED</p>
          <h1>Place every crew member on the worksite first.</h1>
          <p>
            In Behavioral Factors, select each team member, place them on the
            assessed object, and apply their protection update before building
            the crew plan.
          </p>
        </section>
      </main>
    );
  }

  if (!hasAppliedProtectionPlan) {
    return (
      <main className="shiftWorkspace">
        <section className="shiftEmptyState">
          <p className="eyebrow">MORNING BRIEF LOCKED</p>
          <h1>Apply a protection update before opening the morning plan.</h1>
          <p>
            Complete the selected worker's PPE, SPF, and work-zone update in
            Behavioral Factors. Umbra will then rebuild the affected plan.
          </p>
        </section>
      </main>
    );
  }

  return <Shift />;
}
