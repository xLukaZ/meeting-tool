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

  const reminders = await prisma.meetingReminder.findMany({
    where: {
      status: "scheduled",
      sentAt: null,
      scheduledSendAt: { lte: now },
      meeting: {
        status: { in: ["PENDING", "CONFIRMED", "RESCHEDULED"] },
        startTime: { gte: now },
      },
    },
    include: { meeting: { include: { mitarbeiter: true } } },
    take: 100,
    orderBy: { scheduledSendAt: "asc" },
  });

  const results = [];

  for (const reminder of reminders) {
    const meeting = reminder.meeting;
    try {
      await sendReminderEmail({
        meeting,
        mitarbeiter: meeting.mitarbeiter,
        meetLink: meeting.meetLink,
        tokens: decryptMeetingTokens(meeting),
      });
      await prisma.meetingReminder.update({
        where: { id: reminder.id },
        data: {
          sentAt: new Date(),
          status: "sent",
          error: null,
        },
      });
      await prisma.meetingToken.update({
        where: { id: meeting.id },
        data: { reminderSentAt: new Date(), mailSyncStatus: "synced" },
      });
      results.push({ id: meeting.id, reminderId: reminder.id, status: "sent" });
    } catch (err) {
      await prisma.meetingReminder.update({
        where: { id: reminder.id },
        data: {
          status: "failed",
          error: compactError(err),
        },
      });
      await prisma.meetingToken.update({
        where: { id: meeting.id },
        data: { mailSyncStatus: "failed", syncError: compactError(err) },
      });
      results.push({ id: meeting.id, reminderId: reminder.id, status: "failed" });
    }
  }

  return NextResponse.json({ checked: reminders.length, due: reminders.length, results });
}
