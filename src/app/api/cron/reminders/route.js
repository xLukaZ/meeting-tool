import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendReminderEmail } from "@/lib/mailer";
import { compactError } from "@/lib/meetings";
import { decryptMeetingTokens } from "@/lib/tokens";
import { requireAdmin } from "@/lib/session";

async function isAllowed(request) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === process.env.SESSION_SECRET) return true;
  return Boolean(await requireAdmin());
}

export async function GET(request) {
  if (!(await isAllowed(request))) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const now = new Date();
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const meetings = await prisma.meetingToken.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED", "RESCHEDULED"] },
      reminderSentAt: null,
      startTime: { gte: now, lte: until },
    },
    include: { mitarbeiter: true },
    take: 100,
    orderBy: { startTime: "asc" },
  });

  const results = [];

  for (const meeting of meetings) {
    try {
      await sendReminderEmail({
        meeting,
        mitarbeiter: meeting.mitarbeiter,
        meetLink: meeting.meetLink,
        tokens: decryptMeetingTokens(meeting),
      });
      await prisma.meetingToken.update({
        where: { id: meeting.id },
        data: {
          reminderSentAt: new Date(),
          mailSyncStatus: "synced",
        },
      });
      results.push({ id: meeting.id, status: "sent" });
    } catch (err) {
      await prisma.meetingToken.update({
        where: { id: meeting.id },
        data: {
          mailSyncStatus: "failed",
          syncError: compactError(err),
        },
      });
      results.push({ id: meeting.id, status: "failed" });
    }
  }

  return NextResponse.json({ checked: meetings.length, results });
}
