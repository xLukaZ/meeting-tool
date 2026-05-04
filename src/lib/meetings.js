import { prisma } from "./db";
import { hashToken } from "./tokens";

export async function findMeetingByToken(token, allowedPurposes = ["confirmation", "reschedule", "cancel"]) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const or = [];
  if (allowedPurposes.includes("confirmation")) {
    or.push({ confirmationTokenHash: tokenHash });
  }
  if (allowedPurposes.includes("reschedule")) {
    or.push({ rescheduleTokenHash: tokenHash });
  }
  if (allowedPurposes.includes("cancel")) {
    or.push({ cancelTokenHash: tokenHash });
  }

  if (!or.length) return null;

  return prisma.meetingToken.findFirst({
    where: { OR: or },
    include: { mitarbeiter: true },
  });
}

export function isActiveMeeting(meeting) {
  return Boolean(meeting && !["CANCELLED", "COMPLETED"].includes(meeting.status));
}

export function compactError(error) {
  return String(error?.message || error || "Unbekannter Fehler").slice(0, 1000);
}
