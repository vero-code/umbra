const rotationDurationMinutes = 20;
const rotationLeadMinutes = 5;
const rotationCadenceMinutes = 105;

function minutesForClock(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClock(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function rotationWindows(site) {
  const [shiftStart, shiftEnd] = String(site.shift || "").split("-");
  const shiftStartMinutes = minutesForClock(shiftStart) ?? 0;
  const shiftEndMinutes = minutesForClock(shiftEnd) ?? 24 * 60;
  const localHour = Number(site.forecast?.localHour);
  const currentMinutes = Number.isFinite(localHour)
    ? Math.round(localHour * 60)
    : shiftStartMinutes;
  const firstStart = Math.max(
    shiftStartMinutes,
    currentMinutes + rotationLeadMinutes,
  );
  const windows = [];

  for (
    let start = firstStart;
    start + rotationDurationMinutes <= shiftEndMinutes && windows.length < 3;
    start += rotationCadenceMinutes
  ) {
    windows.push(
      `${formatClock(start)}-${formatClock(start + rotationDurationMinutes)}`,
    );
  }

  return windows;
}

export function buildRotationBlocks(site, workers, equipment) {
  const maxOut =
    equipment === "failed" ? 1 : Math.max(1, Math.floor(workers.length / 2));
  return rotationWindows(site).map((window, index) => ({
    window,
    breakMinutes: rotationDurationMinutes,
    workers: workers
      .slice(index % workers.length, (index % workers.length) + maxOut)
      .map((worker) => worker.id),
  }));
}
