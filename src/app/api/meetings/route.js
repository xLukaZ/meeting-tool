// GET /api/meetings?status=ACTIVE&mitarbeiterId=xxx&limit=50
// Für das Admin-Dashboard

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, unauthorizedJson } from "@/lib/session";
import { cancelCalendarEvent } from "@/lib/google-calendar";
import { getHubSpotConfigured, syncHubSpotUpdate } from "@/lib/hubspot";

export async function GET(request) {
  try {
    if (!(await requireAdmin())) return unauthorizedJson();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const mitarbeiterId = searchParams.get("mitarbeiterId");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where = {};
    if (status) where.status = status;
    if (mitarbeiterId) where.mitarbeiterId = mitarbeiterId;

    const meetings = await prisma.meetingToken.findMany({
      where,
      orderBy: { startTime: "desc" },
      take: limit,
      select: {
        id: true,
        googleEventId: true,
        googleMeetLink: true,
        meetLink: true,
        googleSyncStatus: true,
        hubspotMeetingId: true,
        hubspotContactEmail: true,
        hubspotOwnerEmail: true,
        hubspotSyncStatus: true,
        mailSyncStatus: true,
        reminderSentAt: true,
        mitarbeiterId: true,
        startTime: true,
        endTime: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        company: true,
        status: true,
        confirmedAt: true,
        cancellationReason: true,
        syncError: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        callerId: true,
        caller: { select: { id: true, name: true, slug: true } },
        mitarbeiter: { select: { name: true, email: true, reminderLeadMinutes: true } },
        reminders: {
          orderBy: { scheduledSendAt: "asc" },
          select: {
            id: true,
            leadMinutes: true,
            scheduledSendAt: true,
            sentAt: true,
            status: true,
            error: true,
          },
        },
      },
    });

    return NextResponse.json({ meetings });
  } catch (err) {
    console.error("[meetings]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!(await requireAdmin())) return unauthorizedJson();

    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");
    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ error: "Termin-ID fehlt" }, { status: 400 });
    }

    const meeting = await prisma.meetingToken.findUnique({
      where: { id },
      include: { mitarbeiter: true },
    });
    if (!meeting) {
      return NextResponse.json({ error: "Termin nicht gefunden" }, { status: 404 });
    }

    if (meeting.googleEventId && process.env.ENABLE_MOCK_BOOKING !== "true") {
      await cancelCalendarEvent({
        mitarbeiterId: meeting.mitarbeiterId,
        googleEventId: meeting.googleEventId,
      });
    }

    if ((await getHubSpotConfigured()) && meeting.hubspotMeetingId) {
      await syncHubSpotUpdate({
        meeting,
        mitarbeiter: meeting.mitarbeiter,
        meetLink: meeting.meetLink,
        outcome: "CANCELED",
      });
    }

    await prisma.meetingToken.delete({ where: { id } });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[meetings:delete]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
