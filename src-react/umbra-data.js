import { useEffect } from "react";
import { create } from "zustand";

export const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};

export const profileKey = (profile) =>
  `umbra_external_evidence_${profile?.company || ""}:${profile?.name || ""}`;

export const protectionPlanKey = (profile) =>
  `umbra_protection_plan_${profile?.company || ""}:${profile?.name || ""}`;

export const hasWorkerPlacement = (worker, sites = []) => {
  const position = worker?.behavioralFactors?.mapPosition;
  const hasCoordinates =
    Number.isFinite(Number(position?.x)) &&
    Number.isFinite(Number(position?.y));
  const hasAssessedSite = sites.some(
    (site) => site.id === position?.siteId && site.propertyAssessment,
  );
  return Boolean(hasCoordinates && hasAssessedSite);
};

export const hasCompleteCrewPlacement = (state) => {
  const workers = state?.workers || [];
  return (
    workers.length > 0 &&
    workers.every((worker) => hasWorkerPlacement(worker, state?.sites || []))
  );
};

const statePath = (profile) =>
  `/api/state?foreman=${encodeURIComponent(profile?.name || "")}&company=${encodeURIComponent(profile?.company || "")}`;

export const useUmbra = create((set) => ({
  profile: JSON.parse(localStorage.getItem("umbra_foreman_profile") || "null"),
  state: null,
  setState: (state) => set({ state }),
  setProfile: (profile) => {
    if (profile)
      localStorage.setItem("umbra_foreman_profile", JSON.stringify(profile));
    else localStorage.removeItem("umbra_foreman_profile");
    set({ profile, state: null });
  },
}));

export function useData() {
  const profile = useUmbra((store) => store.profile);
  const state = useUmbra((store) => store.state);
  const setState = useUmbra((store) => store.setState);
  const refresh = async () => setState(await api(statePath(profile)));
  useEffect(() => {
    refresh();
  }, []);
  return { profile, state, setState, refresh };
}
