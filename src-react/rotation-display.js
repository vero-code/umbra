const rotationDurationMinutes = 20;
const rotationLeadMinutes = 5;
const rotationCadenceMinutes = 105;

const minutesForClock = (value) => {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatClock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;

export function displayRotationBlocks(blocks = [], site, environment) {
  const localHour = Number(environment?.hour);
  const firstStart = minutesForClock(blocks[0]?.window?.split("-")[0]);
  if (!Number.isFinite(localHour) || firstStart === null) return blocks;

  const currentMinutes = Math.round(localHour * 60);
  if (firstStart >= currentMinutes) return blocks;

  const [, shiftEnd] = String(site?.shift || "").split("-");
  const shiftEndMinutes = minutesForClock(shiftEnd) ?? 24 * 60;
  const nextStart = currentMinutes + rotationLeadMinutes;
  const rebasedBlocks = blocks
    .map((block, index) => {
      const start = nextStart + rotationCadenceMinutes * index;
      return {
        ...block,
        window: `${formatClock(start)}-${formatClock(
          start + rotationDurationMinutes,
        )}`,
      };
    })
    .filter((block) => {
      const [, end] = block.window.split("-");
      return (minutesForClock(end) ?? 0) <= shiftEndMinutes;
    });

  return rebasedBlocks.length ? rebasedBlocks : blocks;
}
