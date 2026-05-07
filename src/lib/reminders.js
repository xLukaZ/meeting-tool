
/**
 * Convert a local Europe/Berlin date+time to a UTC Date.
 * Works correctly across DST transitions.
 */
function berlinToUTC(year, monthIndex, day, hour, minute) {
  // Start with a naive UTC timestamp at the target H:M
  const estimate = new Date(Date.UTC(year, monthIndex, day, hour, minute));

  // Ask what Berlin clock shows for that UTC instant
  const fmt = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Berlin",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(estimate).map((p) => [p.type, p.value]));
  const berlinHour = Number(parts.hour === "24" ? 0 : parts.hour);
  const berlinMinute = Number(parts.minute);

  // Shift estimate so Berlin shows the desired time
  const diffMs = ((hour - berlinHour) * 60 + (minute - berlinMinute)) * 60_000;
  return new Date(estimate.getTime() + diffMs);
}

/**
 * Compute scheduledSendAt for a single config item.
 *
 * New format: { days: number, hour: number, minute: number }
 *   → send at HH:MM Berlin time, `days` calendar days before the meeting date.
 *
 * Legacy format: number (minutes before meeting start time)
 */
function scheduledSendAtFromConfig(startTime, config) {
  if (typeof config === "number") {
    return new Date(new Date(startTime).getTime() - config * 60_000);
  }

  const { days, hour, minute } = config;

  // Get the meeting date in Europe/Berlin timezone (YYYY-MM-DD)
  const berlinDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date(startTime));

  const [y, m, d] = berlinDateStr.split("-").map(Number);

  // Subtract calendar days in local (Berlin) date arithmetic
  const reminderLocalDate = new Date(y, m - 1, d - Number(days));

  return berlinToUTC(
    reminderLocalDate.getFullYear(),
    reminderLocalDate.getMonth(),
    reminderLocalDate.getDate(),
    Number(hour),
    Number(minute)
  );
}

/**
 * Validate and normalise an array of reminder configs.
 * Accepts the new object format, the legacy integer format, or a mix.
 * Returns only valid configs, deduplicated.
 */
export function normalizeReminderConfigs(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const result = [];

  for (const item of value) {
    let config;

    if (typeof item === "number") {
      if (!Number.isInteger(item) || item <= 0 || item > 30 * 24 * 60) continue;
      config = item; // keep legacy number as-is
    } else if (item && typeof item === "object") {
      const days = Number(item.days);
      const hour = Number(item.hour);
      const minute = Number(item.minute);
      if (
        !Number.isInteger(days) || days < 0 || days > 30 ||
        !Number.isInteger(hour) || hour < 0 || hour > 23 ||
        !Number.isInteger(minute) || minute < 0 || minute > 59
      ) continue;
      config = { days, hour, minute };
    } else {
      continue;
    }

    const key = JSON.stringify(config);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(config);
    }
  }

  return result;
}

/**
 * Build the array of MeetingReminder rows to insert.
 * leadOptions accepts:
 *   - Array of { days, hour, minute }  (new exact-time format)
 *   - Array of numbers                 (legacy minutes-before-meeting format)
 *   - null / undefined                 (no reminders)
 */
export function reminderScheduleData({ meetingId, startTime, leadOptions }) {
  const configs = normalizeReminderConfigs(leadOptions);

  return configs
    .map((config) => {
      const scheduledSendAt = scheduledSendAtFromConfig(startTime, config);

      // Skip reminders already in the past (e.g. booking made very close to start)
      if (scheduledSendAt <= new Date()) return null;

      // leadMinutes: required DB column + unique key; compute from actual times
      const leadMinutes = Math.round(
        (new Date(startTime).getTime() - scheduledSendAt.getTime()) / 60_000
      );

      return { meetingId, leadMinutes, scheduledSendAt };
    })
    .filter(Boolean);
}
