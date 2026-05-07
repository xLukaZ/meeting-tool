import { google } from "googleapis";
import { prisma } from "./db";
import { decrypt, encrypt } from "./encrypt";

export const ADMIN_GOOGLE_SCOPES = ["openid", "email", "profile"];
export const EMPLOYEE_GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGoogleAuthUrl({ state, scopes }) {
  const auth = getOAuthClient();
  return auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
  });
}

export async function exchangeCodeForTokens(code) {
  const auth = getOAuthClient();
  const { tokens } = await auth.getToken(code);
  return tokens;
}

export async function getGoogleProfile(tokens) {
  const auth = getOAuthClient();
  auth.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth });
  const profile = await oauth2.userinfo.get();
  return profile.data;
}

export async function handleEmployeeOAuthCallback(code, mitarbeiterId) {
  const tokens = await exchangeCodeForTokens(code);
  const existing = await prisma.mitarbeiter.findUnique({ where: { id: mitarbeiterId } });

  if (!existing) {
    throw new Error("Mitarbeiter wurde nicht gefunden.");
  }

  const refreshToken = tokens.refresh_token || decrypt(existing.refreshToken);
  if (!refreshToken) {
    throw new Error("Google hat keinen refresh_token geliefert. Bitte erneut mit Consent verbinden.");
  }

  await prisma.mitarbeiter.update({
    where: { id: mitarbeiterId },
    data: {
      accessToken: tokens.access_token ? encrypt(tokens.access_token) : existing.accessToken,
      refreshToken: encrypt(refreshToken),
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : existing.tokenExpiry,
    },
  });
}

export async function getAuthForMitarbeiter(mitarbeiterId) {
  const mitarbeiter = await prisma.mitarbeiter.findUnique({
    where: { id: mitarbeiterId },
  });

  if (!mitarbeiter?.refreshToken) {
    throw new Error(`Kein Google-Kalender verbunden für Mitarbeiter ${mitarbeiterId}`);
  }

  const auth = getOAuthClient();
  auth.setCredentials({
    access_token: decrypt(mitarbeiter.accessToken),
    refresh_token: decrypt(mitarbeiter.refreshToken),
    expiry_date: mitarbeiter.tokenExpiry?.getTime(),
  });

  auth.on("tokens", async (tokens) => {
    const data = {};
    if (tokens.expiry_date) data.tokenExpiry = new Date(tokens.expiry_date);
    if (tokens.access_token) data.accessToken = encrypt(tokens.access_token);
    if (tokens.refresh_token) data.refreshToken = encrypt(tokens.refresh_token);

    if (Object.keys(data).length > 0) {
      await prisma.mitarbeiter.update({ where: { id: mitarbeiterId }, data });
    }
  });

  const expiresSoon =
    !mitarbeiter.tokenExpiry ||
    mitarbeiter.tokenExpiry.getTime() < Date.now() + 60 * 1000;
  if (expiresSoon || !mitarbeiter.accessToken) {
    await auth.getAccessToken();
  }

  return auth;
}

export async function getAvailableSlots(mitarbeiterId, dateFrom, dateTo) {
  const mitarbeiter = await prisma.mitarbeiter.findUnique({
    where: { id: mitarbeiterId },
  });

  if (!mitarbeiter || !mitarbeiter.isActive) return [];

  if (process.env.ENABLE_MOCK_AVAILABILITY === "true" && !mitarbeiter.refreshToken) {
    return generateTimeSlots(mitarbeiter, dateFrom, dateTo);
  }

  const auth = await getAuthForMitarbeiter(mitarbeiterId);
  const calendar = google.calendar({ version: "v3", auth });

  const freebusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: dateFrom.toISOString(),
      timeMax: dateTo.toISOString(),
      items: [{ id: mitarbeiter.calendarId }],
    },
  });

  const busySlots = freebusy.data.calendars?.[mitarbeiter.calendarId]?.busy || [];
  const allSlots = generateTimeSlots(mitarbeiter, dateFrom, dateTo);

  return allSlots.filter((slot) => {
    const bufferedStart = new Date(
      slot.start.getTime() - mitarbeiter.bufferBeforeMinutes * 60 * 1000
    );
    const bufferedEnd = new Date(
      slot.end.getTime() + mitarbeiter.bufferAfterMinutes * 60 * 1000
    );

    return !busySlots.some((busy) => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return bufferedStart < busyEnd && bufferedEnd > busyStart;
    });
  });
}

export async function createCalendarEvent({
  mitarbeiterId,
  requestId,
  title,
  startTime,
  endTime,
  attendeeEmail,
  attendeeName,
}) {
  const auth = await getAuthForMitarbeiter(mitarbeiterId);
  const calendar = google.calendar({ version: "v3", auth });

  const mitarbeiter = await prisma.mitarbeiter.findUnique({
    where: { id: mitarbeiterId },
  });

  const event = {
    summary: title || `Meeting mit ${attendeeName} - 360 Vista`,
    start: { dateTime: startTime, timeZone: "Europe/Berlin" },
    end: { dateTime: endTime, timeZone: "Europe/Berlin" },
    attendees: [
      { email: mitarbeiter.email, displayName: mitarbeiter.name },
      { email: attendeeEmail, displayName: attendeeName },
    ],
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const response = await calendar.events.insert({
    calendarId: mitarbeiter.calendarId,
    conferenceDataVersion: 1,
    sendUpdates: "none",
    requestBody: event,
  });

  return {
    googleEventId: response.data.id,
    googleMeetLink: response.data.conferenceData?.entryPoints?.[0]?.uri || null,
  };
}

export async function rescheduleCalendarEvent({
  mitarbeiterId,
  googleEventId,
  newStartTime,
  newEndTime,
}) {
  if (!googleEventId) throw new Error("Google Event ID fehlt.");

  const auth = await getAuthForMitarbeiter(mitarbeiterId);
  const calendar = google.calendar({ version: "v3", auth });

  const mitarbeiter = await prisma.mitarbeiter.findUnique({
    where: { id: mitarbeiterId },
  });

  await calendar.events.patch({
    calendarId: mitarbeiter.calendarId,
    eventId: googleEventId,
    sendUpdates: "none",
    requestBody: {
      start: { dateTime: newStartTime, timeZone: "Europe/Berlin" },
      end: { dateTime: newEndTime, timeZone: "Europe/Berlin" },
    },
  });
}

export async function cancelCalendarEvent({ mitarbeiterId, googleEventId }) {
  if (!googleEventId) return;

  const auth = await getAuthForMitarbeiter(mitarbeiterId);
  const calendar = google.calendar({ version: "v3", auth });

  const mitarbeiter = await prisma.mitarbeiter.findUnique({
    where: { id: mitarbeiterId },
  });

  await calendar.events.delete({
    calendarId: mitarbeiter.calendarId,
    eventId: googleEventId,
    sendUpdates: "none",
  });
}

function generateTimeSlots(mitarbeiter, from, to) {
  const durationMinutes = mitarbeiter.meetingDurationMinutes || 30;
  const slots = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  const endBoundary = new Date(to);
  const now = new Date();

  while (cursor < endBoundary) {
    const weekday = cursor.getDay();
    if (!mitarbeiter.disabledWeekdays.includes(weekday)) {
      const dayStart = new Date(cursor);
      dayStart.setHours(0, mitarbeiter.workStartMinutes, 0, 0);

      const dayEnd = new Date(cursor);
      dayEnd.setHours(0, mitarbeiter.workEndMinutes, 0, 0);

      const current = new Date(dayStart);
      while (current < dayEnd) {
        const slotEnd = new Date(current.getTime() + durationMinutes * 60 * 1000);
        if (slotEnd <= dayEnd && current >= from && slotEnd <= to && current > now) {
          slots.push({ start: new Date(current), end: slotEnd });
        }
        current.setMinutes(current.getMinutes() + durationMinutes);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}
