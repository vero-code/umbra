import { useEffect, useRef, useState } from "react";
import { api, useData } from "./umbra-data.js";

const protectionDefaults = {
  upf: "cotton",
  spf: "none",
  sunscreenHoursAgo: 0,
  shadeAvailability: "direct",
};

const ppeOptions = [
  {
    id: "cotton",
    label: "Cotton tee",
    detail: "Minimal UV barrier",
    badge: "UPF low",
  },
  {
    id: "visor",
    label: "Visor + workwear",
    detail: "Hard-hat visor and coverage",
    badge: "UPF medium",
  },
  {
    id: "upf50",
    label: "UPF 50+ suit",
    detail: "Full coverage workwear",
    badge: "UPF 50+",
  },
];

const spfOptions = [
  { id: "none", label: "No SPF", detail: "No sunscreen reduction" },
  { id: "spf30", label: "SPF 30", detail: "Standard sunscreen layer" },
  { id: "spf50", label: "SPF 50", detail: "Higher sunscreen layer" },
];

const shadeOptions = [
  { id: "direct", label: "Direct sun", detail: "Roof or open deck" },
  { id: "partial", label: "Partial shade", detail: "Moving slab shadow" },
  { id: "canopy", label: "Canopy", detail: "Consistent relief zone" },
];

const protectionFor = (worker) => ({
  ...protectionDefaults,
  upf: worker?.behavioralFactors?.upf || protectionDefaults.upf,
  spf: worker?.behavioralFactors?.spf || protectionDefaults.spf,
  sunscreenHoursAgo:
    worker?.behavioralFactors?.sunscreenHoursAgo ??
    protectionDefaults.sunscreenHoursAgo,
  shadeAvailability:
    worker?.behavioralFactors?.shadeAvailability ||
    protectionDefaults.shadeAvailability,
});

const siteFor = (worker, sites) =>
  sites.find((site) => site.id === worker?.siteId)?.id ||
  sites.at(-1)?.id ||
  null;

const roleLabel = (role) => String(role || "field worker").replaceAll("_", " ");

const sunscreenTime = (hours) => {
  const value = Number(hours || 0);
  return value >= 6 ? "6+ hours ago" : `${value.toFixed(1)} hours ago`;
};

const riskBand = (risk) => {
  if (risk >= 25) return { label: "Critical", tone: "critical" };
  if (risk >= 16) return { label: "High", tone: "high" };
  if (risk >= 8) return { label: "Elevated", tone: "elevated" };
  return { label: "Managed", tone: "managed" };
};

const defaultMapPositions = {
  direct: { x: 49, y: 43 },
  partial: { x: 43, y: 59 },
  canopy: { x: 33, y: 78 },
};

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const shadeForMapPosition = (x, y) => {
  if (x >= 27 && x <= 66 && y >= 66 && y <= 90) return "canopy";
  if (x >= 24 && x <= 76 && y >= 46 && y < 66) return "partial";
  return "direct";
};

const mapPositionKey = (workerId, siteId) => `${workerId}:${siteId}`;

function ProtectionChoices({ label, options, value, onChange }) {
  return (
    <section className="protectionGroup">
      <p className="eyebrow">{label}</p>
      <div className="protectionChoices">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "isSelected" : ""}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            <b>{option.label}</b>
            <small>{option.detail}</small>
            {option.badge && <em>{option.badge}</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function SiteMap({
  worker,
  site,
  shadeAvailability,
  preview,
  mapPosition,
  onMove,
}) {
  const mapRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const image = preview?.site?.image || site?.propertyPhotos?.[0]?.image;
  const positionCopy =
    shadeAvailability === "canopy"
      ? "Relief zone"
      : shadeAvailability === "partial"
        ? " Moving shade"
        : " Direct sun";
  const resolvedPosition =
    mapPosition ||
    defaultMapPositions[shadeAvailability] ||
    defaultMapPositions.direct;
  const updateFromPointer = (event) => {
    const bounds = mapRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = clamp(
      ((event.clientX - bounds.left) / bounds.width) * 100,
      6,
      90,
    );
    const y = clamp(
      ((event.clientY - bounds.top) / bounds.height) * 100,
      8,
      88,
    );
    onMove({ x, y, shadeAvailability: shadeForMapPosition(x, y) });
  };
  const nudgeMarker = (event) => {
    const directions = {
      ArrowUp: [0, -4],
      ArrowDown: [0, 4],
      ArrowLeft: [-4, 0],
      ArrowRight: [4, 0],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const x = clamp(resolvedPosition.x + direction[0], 6, 90);
    const y = clamp(resolvedPosition.y + direction[1], 8, 88);
    onMove({ x, y, shadeAvailability: shadeForMapPosition(x, y) });
  };
  return (
    <>
      <section
        ref={mapRef}
        className={`behaviorSiteMap shade-${shadeAvailability}`}
      >
        {image ? (
          <img src={image} alt={`${site?.name || "Worksite"} exposure map`} />
        ) : (
          <div
            className="behaviorMapFallback"
            aria-label="Worksite schematic"
          />
        )}
        <div className="behaviorMapOverlay" aria-hidden="true" />
        <span className="mapSunMarker" aria-hidden="true">
          Sun · 13:00
        </span>
        <span className="mapExposureZone directZone">Roof / direct sun</span>
        <span className="mapExposureZone shadeZone">Canopy / shade zone</span>
        <button
          type="button"
          className={`mapWorkerMarker ${isDragging ? "isDragging" : ""}`}
          style={{
            left: `${resolvedPosition.x}%`,
            top: `${resolvedPosition.y}%`,
            right: "auto",
            bottom: "auto",
          }}
          aria-label={`Move ${worker?.name || "worker"} on the worksite map`}
          onKeyDown={nudgeMarker}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setIsDragging(true);
            updateFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (isDragging) updateFromPointer(event);
          }}
          onPointerUp={(event) => {
            if (isDragging) updateFromPointer(event);
            setIsDragging(false);
          }}
          onPointerCancel={() => setIsDragging(false)}
        >
          <span className="crewInitial figurine builder" aria-hidden="true">
            <i />
            <em />
          </span>
          <span>
            <b>{worker?.name || "Worker"}</b>
            <small>{positionCopy}</small>
          </span>
        </button>
      </section>
      <p className="mapPlacementHint">
        Drag the worker onto the photo. Umbra treats the upper deck as direct
        sun, interior lower floors as partial shade, and the outlined relief
        area as canopy shade.
      </p>
    </>
  );
}

export default function Behavioral() {
  const { profile, state, setState } = useData();
  const workers = state?.workers || [];
  const sites = state?.sites || [];
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [protection, setProtection] = useState(protectionDefaults);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [mapPositions, setMapPositions] = useState({});

  const selectedWorker = workers.find(
    (worker) => worker.id === selectedWorkerId,
  );
  const activeSite =
    sites.find((site) => site.id === selectedSiteId) || sites.at(-1) || null;
  const selectedRisk = riskBand(preview?.projectedRisk || 0);
  const selectedMapKey =
    selectedWorker && activeSite
      ? mapPositionKey(selectedWorker.id, activeSite.id)
      : null;
  const selectedBehavioralFactors = selectedWorker?.behavioralFactors ?? {};
  const storedMapPosition =
    selectedBehavioralFactors.mapPosition?.siteId === activeSite?.id
      ? selectedBehavioralFactors.mapPosition
      : null;
  const selectedMapPosition =
    (selectedMapKey && mapPositions[selectedMapKey]) || storedMapPosition;

  useEffect(() => {
    if (selectedWorker || !workers[0]) return;
    setSelectedWorkerId(workers[0].id);
    setProtection(protectionFor(workers[0]));
    setSelectedSiteId(siteFor(workers[0], sites));
  }, [selectedWorker, sites, workers]);

  useEffect(() => {
    if (!selectedWorker || !activeSite) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setMessage("");
    api("/api/behavioral-factors/preview", {
      method: "POST",
      body: JSON.stringify({
        profile,
        workerId: selectedWorker.id,
        siteId: activeSite.id,
        ...protection,
      }),
    })
      .then((data) => {
        if (!cancelled) setPreview(data.preview);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error.message);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeSite?.id,
    profile,
    protection.shadeAvailability,
    protection.spf,
    protection.sunscreenHoursAgo,
    protection.upf,
    selectedWorker?.id,
  ]);

  const chooseWorker = (worker) => {
    setSelectedWorkerId(worker.id);
    setSelectedSiteId(siteFor(worker, sites));
    setProtection(protectionFor(worker));
  };

  const updateShadeAvailability = (shadeAvailability) => {
    setProtection((current) => ({ ...current, shadeAvailability }));
    if (!selectedMapKey) return;
    setMapPositions((current) => ({
      ...current,
      [selectedMapKey]: {
        ...defaultMapPositions[shadeAvailability],
        shadeAvailability,
      },
    }));
  };

  const moveWorkerOnMap = (position) => {
    if (!selectedMapKey) return;
    setMapPositions((current) => ({ ...current, [selectedMapKey]: position }));
    setProtection((current) => ({
      ...current,
      shadeAvailability: position.shadeAvailability,
    }));
  };

  const applyProtection = async () => {
    if (!selectedWorker || !activeSite) return;
    try {
      setIsApplying(true);
      setMessage(
        "Applying protection status and rebuilding the affected plan...",
      );
      const data = await api("/api/behavioral-factors", {
        method: "POST",
        body: JSON.stringify({
          profile,
          workerId: selectedWorker.id,
          siteId: activeSite.id,
          mapPosition: selectedMapPosition
            ? { ...selectedMapPosition, siteId: activeSite.id }
            : null,
          ...protection,
        }),
      });
      setState(data.state);
      setMessage(
        `${selectedWorker.name}'s protection status was applied. Umbra updated the affected site plan.`,
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsApplying(false);
    }
  };

  if (!workers.length) {
    return (
      <main className="reactWorkspace">
        <section className="behavioralEmpty">
          <p className="eyebrow">BEHAVIORAL FACTORS</p>
          <h1>Add a crew member before recording protection status.</h1>
          <p>
            Umbra needs a worker profile before it can apply PPE, SPF, and shade
            conditions to an individual exposure plan.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="reactWorkspace">
      <section className="behavioralHero">
        <div className="behavioralHeroCopy">
          <p className="eyebrow">WORKING CONDITIONS &amp; PROTECTION</p>
          <h1>Turn protection into a safer work plan.</h1>
          <p>
            Select a crew member, place them in the worksite conditions, and see
            how clothing, sunscreen, and shade change their individual risk.
          </p>
        </div>

        <aside className="behaviorCrewRail" aria-label="Crew protection status">
          <p className="eyebrow">CREW PROTECTION STATUS</p>
          <div className="behaviorCrewList">
            {workers.map((worker) => {
              const factors = worker.behavioralFactors;
              return (
                <button
                  key={worker.id}
                  type="button"
                  className={
                    worker.id === selectedWorker?.id ? "isSelected" : ""
                  }
                  aria-pressed={worker.id === selectedWorker?.id}
                  onClick={() => chooseWorker(worker)}
                >
                  <span
                    className="crewInitial figurine builder"
                    aria-hidden="true"
                  >
                    <i />
                    <em />
                  </span>
                  <span>
                    <b>{worker.name}</b>
                    <small>{roleLabel(worker.role)}</small>
                  </span>
                  <em>{factors ? "Protection set" : "Needs setup"}</em>
                </button>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="behavioralGrid">
        <article className="protectionControls">
          <div className="selectedWorkerHeading">
            <span className="crewInitial figurine builder" aria-hidden="true">
              <i />
              <em />
            </span>
            <div>
              <p className="eyebrow">PROTECTION PROFILE</p>
              <h2>{selectedWorker?.name}</h2>
              <small>{roleLabel(selectedWorker?.role)}</small>
            </div>
          </div>

          <ProtectionChoices
            label="UPF / protective equipment"
            options={ppeOptions}
            value={protection.upf}
            onChange={(upf) =>
              setProtection((current) => ({ ...current, upf }))
            }
          />
          <ProtectionChoices
            label="Sunscreen"
            options={spfOptions}
            value={protection.spf}
            onChange={(spf) =>
              setProtection((current) => ({ ...current, spf }))
            }
          />

          <section className="sunscreenClock">
            <div>
              <p className="eyebrow">TIME SINCE APPLICATION</p>
              <b>{sunscreenTime(protection.sunscreenHoursAgo)}</b>
              <small>
                {Number(protection.sunscreenHoursAgo) > 2
                  ? "SPF reduction has expired in the planning engine."
                  : "SPF remains active through the two-hour working window."}
              </small>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="0.25"
              value={protection.sunscreenHoursAgo}
              disabled={protection.spf === "none"}
              aria-label="Hours since sunscreen application"
              onChange={(event) =>
                setProtection((current) => ({
                  ...current,
                  sunscreenHoursAgo: Number(event.target.value),
                }))
              }
            />
          </section>

          <ProtectionChoices
            label="Shade availability"
            options={shadeOptions}
            value={protection.shadeAvailability}
            onChange={updateShadeAvailability}
          />
        </article>

        <section className="behaviorVisualStack">
          <article className="behaviorMapPanel">
            <div className="behaviorMapHeader">
              <div>
                <p className="eyebrow">CURRENT WORK ZONE</p>
                <h2>{activeSite?.propertyObjectName || activeSite?.name}</h2>
                <small>
                  {activeSite?.propertyLocation || "Location not recorded"}
                </small>
              </div>
              {sites.length > 1 && (
                <div
                  className="behaviorSiteTabs"
                  aria-label="Choose active worksite"
                >
                  {sites.map((site) => (
                    <button
                      key={site.id}
                      type="button"
                      className={site.id === activeSite?.id ? "isSelected" : ""}
                      aria-pressed={site.id === activeSite?.id}
                      onClick={() => setSelectedSiteId(site.id)}
                    >
                      {site.propertyObjectName || site.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SiteMap
              worker={selectedWorker}
              site={activeSite}
              shadeAvailability={protection.shadeAvailability}
              preview={preview}
              mapPosition={selectedMapPosition}
              onMove={moveWorkerOnMap}
            />
          </article>

          <article className="protectionImpact">
            <div className="impactHeader">
              <div>
                <p className="eyebrow">UMBRA'S PROTECTION IMPACT</p>
                <h2>
                  {previewLoading
                    ? "Recalculating exposure..."
                    : "Protection changes the plan."}
                </h2>
              </div>
              {preview && (
                <span className={`riskPill ${selectedRisk.tone}`}>
                  {selectedRisk.label} risk
                </span>
              )}
            </div>
            {preview ? (
              <>
                <div className="impactFlow">
                  <span>
                    <small>External site dose</small>
                    <b>{preview.environment.doseIndex}</b>
                  </span>
                  <i aria-hidden="true">→</i>
                  <span>
                    <small>Protection stack</small>
                    <b>× {preview.protectionFactor}</b>
                  </span>
                  <i aria-hidden="true">→</i>
                  <span>
                    <small>Individual risk</small>
                    <b>{preview.projectedRisk}</b>
                  </span>
                </div>
                <p className="impactDelta">
                  {preview.reductionPercent > 0
                    ? `${preview.reductionPercent}% lower than the current protection profile.`
                    : "No additional reduction versus the current protection profile."}
                </p>
                <p className="impactProfile">
                  <b>Recorded profile:</b>{" "}
                  {preview.profileFactors.inputs.join(" · ")}.
                  {preview.profileFactors.reviewRequired &&
                    " Occupational-health review remains flagged."}
                </p>
                <p className="impactRecommendation">{preview.recommendation}</p>
                <p className="spfStatus">{preview.sunscreenStatus}</p>
              </>
            ) : (
              <p className="impactEmpty">
                Select a worksite and protection profile to model the worker's
                individual risk.
              </p>
            )}
            <button
              type="button"
              className="applyProtection"
              disabled={!preview || isApplying}
              onClick={applyProtection}
            >
              {isApplying
                ? "Updating plan..."
                : "Apply protection update & replan"}
            </button>
            {message && <small className="behaviorMessage">{message}</small>}
          </article>
        </section>
      </section>
    </main>
  );
}
