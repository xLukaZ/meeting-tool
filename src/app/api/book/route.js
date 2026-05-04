import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCalendarEvent, getAvailableSlots } from "@/lib/google-calendar";
import { getHubSpotConfigured, syncHubSpotBooking } from "@/lib/hubspot";
import { isSmtpConfigured, sendBookingEmail } from "@/lib/mailer";
import { checkRateLimit } from "@/lib/ratelimit";
import { bookingSchema } from "@/lib/validation";
import { compactError } from "@/lib/meetings";
import { createMeetingTokens } from "@/lib/tokens";

export async function POST(request) {
  let meeting = null;

  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rateLimit = await checkRateLimit(ip, "book");
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Zu viele Buchungsversuche. Bitte versuchen Sie es spaeter erneut." },
        { status: 429 }
      );
    }

    const parsed = bookingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Eingaben", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const {
      mitarbeiterId,
      startTime,
      endTime,
      email,
      firstName,
      lastName,
      phone,
      company,
    } = parsed.data;

    const mitarbeiter = await prisma.mitarbeiter.findUnique({
      where: { id: mitarbeiterId },
    });

    if (!mitarbeiter || !mitarbeiter.isActive) {
      return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    }

    if (!isSmtpConfigured(mitarbeiter)) {
      return NextResponse.json(
        { error: `SMTP fuer ${mitarbeiter.name} ist noch nicht konfiguriert.` },
        { status: 400 }
      );
    }

    const slots = await getAvailableSlots(
      mitarbeiterId,
      new Date(startTime),
      new Date(endTime)
    );
    const requestedSlot = new Date(startTime);
    const isStillFree = slots.some(
      (slot) => slot.start.getTime() === requestedSlot.getTime()
    );
    if (!isStillFree) {
      return NextResponse.json(
        { error: "Dieser Slot ist leider nicht mehr verfuegbar." },
        { status: 409 }
      );
    }

    const tokens = createMeetingTokens();
    const expiresAt = new Date(new Date(endTime).getTime() + 7 * 24 * 60 * 60 * 1000);

    meeting = await prisma.meetingToken.create({
      data: {
        ...tokens.hashes,
        ...tokens.encrypted,
        mitarbeiterId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        email,
        firstName,
        lastName,
        phone,
        company,
        hubspotContactEmail: email,
        hubspotOwnerEmail: mitarbeiter.email,
        expiresAt,
      },
      include: { mitarbeiter: true },
    });

    let meetLink = null;
    try {
      if (process.env.ENABLE_MOCK_BOOKING === "true") {
        meetLink = `https://meet.google.com/mock-${meeting.id.slice(0, 12)}`;
        await prisma.meetingToken.update({
          where: { id: meeting.id },
          data: {
            googleEventId: `mock-${meeting.id}`,
            googleMeetLink: meetLink,
            meetLink,
            googleSyncStatus: "synced",
          },
        });
      } else {
        const googleEvent = await createCalendarEvent({
          mitarbeiterId,
          requestId: meeting.id,
          startTime,
          endTime,
          attendeeEmail: email,
          attendeeName: `${firstName} ${lastName}`,
        });
        meetLink = googleEvent.googleMeetLink;
        if (!meetLink) throw new Error("Google Meet Link konnte nicht erstellt werden.");

        await prisma.meetingToken.update({
          where: { id: meeting.id },
          data: {
            googleEventId: googleEvent.googleEventId,
            googleMeetLink: meetLink,
            meetLink,
            googleSyncStatus: "synced",
          },
        });
      }
    } catch (err) {
      await prisma.meetingToken.update({
        where: { id: meeting.id },
        data: {
          googleSyncStatus: "failed",
          syncError: compactError(err),
        },
      });
      throw err;
    }

    if (await getHubSpotConfigured()) {
      try {
        const hubspot = await syncHubSpotBooking({
          meeting,
          mitarbeiter,
          meetLink,
        });
        await prisma.meetingToken.update({
          where: { id: meeting.id },
          data: {
            ...hubspot,
            hubspotSyncStatus: "synced",
          },
        });
      } catch (err) {
        await prisma.meetingToken.update({
          where: { id: meeting.id },
          data: {
            hubspotSyncStatus: "failed",
            syncError: compactError(err),
          },
        });
      }
    } else {
      await prisma.meetingToken.update({
        where: { id: meeting.id },
        data: { hubspotSyncStatus: "not_configured" },
      });
    }

    const mailMeeting = await prisma.meetingToken.findUnique({
      where: { id: meeting.id },
      include: { mitarbeiter: true },
    });

    try {
      await sendBookingEmail({
        meeting: mailMeeting,
        mitarbeiter,
        meetLink,
        tokens: tokens.raw,
      });
      await prisma.meetingToken.update({
        where: { id: meeting.id },
        data: { mailSyncStatus: "synced" },
      });
    } catch (err) {
      await prisma.meetingToken.update({
        where: { id: meeting.id },
        data: {
          mailSyncStatus: "failed",
          syncError: compactError(err),
        },
      });
      throw err;
    }

    return NextResponse.json({
      success: true,
      meetLink,
      token: tokens.raw.rescheduleToken,
      confirmationToken: tokens.raw.confirmationToken,
      rescheduleToken: tokens.raw.rescheduleToken,
      cancelToken: tokens.raw.cancelToken,
    });
  } catch (err) {
    console.error("[book]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
