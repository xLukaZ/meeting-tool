import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rescheduleCalendarEvent, getAvailableSlots } from "@/lib/google-calendar";
import {
  getHubSpotConfigured,
  syncHubSpotBooking,
  syncHubSpotUpdate,
} from "@/lib/hubspot";
import { sendRescheduleEmail } from "@/lib/mailer";
import { rescheduleSchema } from "@/lib/validation";
import { compactError, findMeetingByToken, isActiveMeeting } from "@/lib/meetings";
import { createMeetingTokens } from "@/lib/tokens";
import { reminderScheduleData } from "@/lib/reminders";

export async function POST(request) {
  try {
    const parsed = rescheduleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingaben", details: parsed.error.errors },
        { status: 400 }
      );
    }
    const { token, newStartTime, newEndTime } = parsed.data;

    const meeting = await findMeetingByToken(token, ["reschedule"]);
    if (!meeting) {
      return NextResponse.json({ error: "Ungültiger Link" }, { status: 404 });
    }
    if (!isActiveMeeting(meeting)) {
      return NextResponse.json({ error: "Dieser Termin ist nicht mehr aktiv" }, { status: 410 });
    }
    if (new Date() > meeting.expiresAt) {
      return NextResponse.json({ error: "Dieser Umbuchungslink ist abgelaufen" }, { status: 410 });
    }

    const slots = await getAvailableSlots(
      meeting.mitarbeiterId,
      new Date(newStartTime),
      new Date(newEndTime)
    );
    const isAvailable = slots.some(
      (slot) => slot.start.getTime() === new Date(newStartTime).getTime()
    );
    if (!isAvailable) {
      return NextResponse.json(
        { error: "Dieser Slot ist nicht mehr verfügbar" },
        { status: 409 }
      );
    }

    const tokens = createMeetingTokens();
    const updated = await prisma.meetingToken.update({
      where: { id: meeting.id },
      data: {
        ...tokens.hashes,
        ...tokens.encrypted,
        startTime: new Date(newStartTime),
        endTime: new Date(newEndTime),
        status: "RESCHEDULED",
        confirmedAt: null,
        rescheduledAt: new Date(),
        expiresAt: new Date(new Date(newEndTime).getTime() + 7 * 24 * 60 * 60 * 1000),
        googleSyncStatus: "pending",
        hubspotSyncStatus: "pending",
        mailSyncStatus: "pending",
        syncError: null,
      },
      include: { mitarbeiter: true },
    });

    await prisma.meetingReminder.deleteMany({ where: { meetingId: updated.id } });
    await prisma.meetingReminder.createMany({
      data: reminderScheduleData({
        meetingId: updated.id,
        startTime: newStartTime,
        leadOptions: updated.mitarbeiter.reminderConfigs ?? updated.mitarbeiter.reminderLeadOptions,
      }),
      skipDuplicates: true,
    });

    try {
      if (process.env.ENABLE_MOCK_BOOKING !== "true") {
        await rescheduleCalendarEvent({
          mitarbeiterId: updated.mitarbeiterId,
          googleEventId: updated.googleEventId,
          newStartTime,
          newEndTime,
        });
      }
      await prisma.meetingToken.update({
        where: { id: updated.id },
        data: { googleSyncStatus: "synced" },
      });
    } catch (err) {
      await prisma.meetingToken.update({
        where: { id: updated.id },
        data: { googleSyncStatus: "failed", syncError: compactError(err) },
      });
      throw err;
    }

    if (await getHubSpotConfigured()) {
      try {
        if (updated.hubspotMeetingId) {
          const hubspot = await syncHubSpotUpdate({
            meeting: updated,
            mitarbeiter: updated.mitarbeiter,
            meetLink: updated.meetLink,
            outcome: "SCHEDULED",
          });
          await prisma.meetingToken.update({
            where: { id: updated.id },
            data: { ...hubspot, hubspotSyncStatus: "synced" },
          });
        } else {
          const hubspot = await syncHubSpotBooking({
            meeting: updated,
            mitarbeiter: updated.mitarbeiter,
            meetLink: updated.meetLink,
          });
          await prisma.meetingToken.update({
            where: { id: updated.id },
            data: { ...hubspot, hubspotSyncStatus: "synced" },
          });
        }
      } catch (err) {
        await prisma.meetingToken.update({
          where: { id: updated.id },
          data: { hubspotSyncStatus: "failed", syncError: compactError(err) },
        });
      }
    } else {
      await prisma.meetingToken.update({
        where: { id: updated.id },
        data: { hubspotSyncStatus: "not_configured" },
      });
    }

    const mailMeeting = await prisma.meetingToken.findUnique({
      where: { id: updated.id },
      include: { mitarbeiter: true },
    });

    try {
      await sendRescheduleEmail({
        meeting: mailMeeting,
        mitarbeiter: mailMeeting.mitarbeiter,
        meetLink: mailMeeting.meetLink,
        tokens: tokens.raw,
      });
      await prisma.meetingToken.update({
        where: { id: updated.id },
        data: { mailSyncStatus: "synced" },
      });
    } catch (err) {
      console.error("[reschedule:mail]", err.message);
      await prisma.meetingToken.update({
        where: { id: updated.id },
        data: { mailSyncStatus: "failed", syncError: compactError(err) },
      });
    }

    return NextResponse.json({
      success: true,
      meetLink: updated.meetLink,
      token: tokens.raw.rescheduleToken,
    });
  } catch (err) {
    console.error("[reschedule]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || url.searchParams.get("t");
    if (!token) return NextResponse.json({ error: "Token fehlt" }, { status: 400 });

    const meeting = await findMeetingByToken(token, ["reschedule", "cancel"]);
    if (!meeting) return NextResponse.json({ error: "Ungültiger Link" }, { status: 404 });
    if (!isActiveMeeting(meeting)) {
      return NextResponse.json({ error: "Termin nicht mehr aktiv" }, { status: 410 });
    }
    if (new Date() > meeting.expiresAt) {
      return NextResponse.json({ error: "Abgelaufen" }, { status: 410 });
    }

    return NextResponse.json({
      firstName: meeting.firstName,
      status: meeting.status,
      confirmedAt: meeting.confirmedAt,
      mitarbeiterName: meeting.mitarbeiter.name,
      mitarbeiterId: meeting.mitarbeiter.id,
      disabledWeekdays: meeting.mitarbeiter.disabledWeekdays,
      meetingDurationMinutes: meeting.mitarbeiter.meetingDurationMinutes,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      meetLink: meeting.meetLink,
    });
  } catch (err) {
    console.error("[reschedule:get]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
