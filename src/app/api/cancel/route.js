import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cancelCalendarEvent } from "@/lib/google-calendar";
import { getHubSpotConfigured, syncHubSpotUpdate } from "@/lib/hubspot";
import { sendCancellationEmail } from "@/lib/mailer";
import { checkRateLimit } from "@/lib/ratelimit";
import { cancelSchema } from "@/lib/validation";
import { compactError, findMeetingByToken, isActiveMeeting } from "@/lib/meetings";

export async function POST(request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rateLimit = await checkRateLimit(ip, "cancel");
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Zu viele Stornierungsversuche. Bitte versuchen Sie es spaeter erneut." },
        { status: 429 }
      );
    }

    const parsed = cancelSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Eingaben", details: parsed.error.errors },
        { status: 400 }
      );
    }
    const { token, reason } = parsed.data;

    const meeting = await findMeetingByToken(token, ["reschedule", "cancel"]);
    if (!meeting) return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    if (!isActiveMeeting(meeting)) {
      return NextResponse.json({ error: "Bereits storniert oder abgeschlossen" }, { status: 410 });
    }
    if (new Date() > meeting.expiresAt) {
      return NextResponse.json({ error: "Link abgelaufen" }, { status: 410 });
    }

    const cancelled = await prisma.meetingToken.update({
      where: { id: meeting.id },
      data: {
        status: "CANCELLED",
        cancellationReason: reason,
        googleSyncStatus: "pending",
        hubspotSyncStatus: "pending",
        mailSyncStatus: "pending",
        syncError: null,
      },
      include: { mitarbeiter: true },
    });

    try {
      if (process.env.ENABLE_MOCK_BOOKING !== "true") {
        await cancelCalendarEvent({
          mitarbeiterId: cancelled.mitarbeiterId,
          googleEventId: cancelled.googleEventId,
        });
      }
      await prisma.meetingToken.update({
        where: { id: cancelled.id },
        data: { googleSyncStatus: "synced" },
      });
    } catch (err) {
      await prisma.meetingToken.update({
        where: { id: cancelled.id },
        data: { googleSyncStatus: "failed", syncError: compactError(err) },
      });
    }

    if ((await getHubSpotConfigured()) && cancelled.hubspotMeetingId) {
      try {
        await syncHubSpotUpdate({
          meeting: cancelled,
          mitarbeiter: cancelled.mitarbeiter,
          meetLink: cancelled.meetLink,
          outcome: "CANCELED",
        });
        await prisma.meetingToken.update({
          where: { id: cancelled.id },
          data: { hubspotSyncStatus: "synced" },
        });
      } catch (err) {
        await prisma.meetingToken.update({
          where: { id: cancelled.id },
          data: { hubspotSyncStatus: "failed", syncError: compactError(err) },
        });
      }
    } else {
      await prisma.meetingToken.update({
        where: { id: cancelled.id },
        data: { hubspotSyncStatus: "not_configured" },
      });
    }

    try {
      await sendCancellationEmail({
        meeting: cancelled,
        mitarbeiter: cancelled.mitarbeiter,
        reason,
      });
      await prisma.meetingToken.update({
        where: { id: cancelled.id },
        data: { mailSyncStatus: "synced" },
      });
    } catch (err) {
      await prisma.meetingToken.update({
        where: { id: cancelled.id },
        data: { mailSyncStatus: "failed", syncError: compactError(err) },
      });
      throw err;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[cancel]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
