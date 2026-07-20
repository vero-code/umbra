import { useRef, useState } from "react";

export const defaultMapPositions = {
  direct: { x: 49, y: 43 },
  partial: { x: 43, y: 59 },
  canopy: { x: 33, y: 78 },
};

export const mapPositionKey = (workerId, siteId) => `${workerId}:${siteId}`;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const shadeForMapPosition = (x, y) => {
  if (x >= 27 && x <= 66 && y >= 66 && y <= 90) return "canopy";
  if (x >= 24 && x <= 76 && y >= 46 && y < 66) return "partial";
  return "direct";
};

export default function BehavioralMap({
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
  const sunHour =
    site?.propertyAssessment?.exposure?.hour ?? site?.forecast?.localHour ?? 12;
  const positionCopy =
    shadeAvailability === "canopy"
      ? "Relief zone"
      : shadeAvailability === "partial"
        ? "Moving shade"
        : "Direct sun";
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
          Sun · {String(Number(sunHour) || 0).padStart(2, "0")}:00
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
