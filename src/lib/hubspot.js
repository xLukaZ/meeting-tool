import { prisma } from "./db";
import { decrypt, encrypt } from "./encrypt";

const HUBSPOT_BASE = "https://api.hubapi.com";
const GLOBAL_SETTINGS_ID = "global";
const APPOINTMENTS_PATH = "/crm/objects/2026-03/appointments";

export async function getHubSpotConfigured() {
  const settings = await prisma.hubSpotSettings.findUnique({
    where: { id: GLOBAL_SETTINGS_ID },
    select: { encryptedAccessToken: true },
  });
  return Boolean(settings?.encryptedAccessToken);
}

export async function saveHubSpotAccessToken(accessToken) {
  const trimmed = String(accessToken || "").trim();
  if (!trimmed) throw new Error("HubSpot Token fehlt.");

  await prisma.hubSpotSettings.upsert({
    where: { id: GLOBAL_SETTINGS_ID },
    create: {
      id: GLOBAL_SETTINGS_ID,
      encryptedAccessToken: encrypt(trimmed),
    },
    update: {
      encryptedAccessToken: encrypt(trimmed),
    },
  });
}

async function getAccessToken() {
  const settings = await prisma.hubSpotSettings.findUnique({
    where: { id: GLOBAL_SETTINGS_ID },
  });

  if (!settings?.encryptedAccessToken) {
    throw new Error("HubSpot ist noch nicht konfiguriert.");
  }

  return decrypt(settings.encryptedAccessToken);
}

async function hubspotFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `HubSpot Fehler (${res.status})`);
  }

  return data;
}

export async function findContactByEmail(email) {
  const data = await hubspotFetch("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [{ propertyName: "email", operator: "EQ", value: email }],
        },
      ],
      properties: ["email", "firstname", "lastname", "phone", "company"],
      limit: 1,
    }),
  });

  return data.results?.[0] || null;
}

export async function createContact({ email, firstName, lastName, phone, company }) {
  return hubspotFetch("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        email,
        firstname: firstName,
        lastname: lastName,
        phone: normalizeGermanPhone(phone),
        company: company || "",
      },
    }),
  });
}

function normalizeGermanPhone(phone) {
  const value = String(phone || "").trim();
  if (!value) return "";

  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0049")) return `+49${digits.slice(4)}`;
  if (digits.startsWith("49")) return `+${digits}`;
  if (digits.startsWith("0")) return `+49${digits.slice(1)}`;
  return `+49${digits}`;
}

export async function findOrCreateContact({ email, firstName, lastName, phone, company }) {
  const existing = await findContactByEmail(email);
  if (existing) return existing;

  return createContact({ email, firstName, lastName, phone, company });
}

async function findOwnerByEmail(email) {
  if (!email) return null;

  try {
    const params = new URLSearchParams({ email, archived: "false" });
    const data = await hubspotFetch(`/crm/v3/owners/?${params.toString()}`);
    return data.results?.[0] || null;
  } catch (err) {
    return null;
  }
}

function appointmentProperties({ title, startTime, endTime, ownerId, meetLink, notes }) {
  return {
    hs_appointment_name: title,
    hs_appointment_start: new Date(startTime).toISOString(),
    hs_appointment_end: new Date(endTime).toISOString(),
    ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
    ...(meetLink ? { hs_meeting_location: meetLink } : {}),
    ...(notes ? { hs_meeting_body: notes } : {}),
  };
}

export async function createHubSpotAppointment({
  contactId,
  ownerId,
  title,
  startTime,
  endTime,
  meetLink,
  notes,
}) {
  return hubspotFetch(APPOINTMENTS_PATH, {
    method: "POST",
    body: JSON.stringify({
      properties: appointmentProperties({
        title,
        startTime,
        endTime,
        meetLink,
        ownerId,
        notes,
      }),
      associations: [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: 906,
            },
          ],
        },
      ],
    }),
  });
}

export async function updateHubSpotMeeting({
  hubspotMeetingId,
  ownerId,
  title,
  startTime,
  endTime,
  meetLink,
  notes,
  outcome,
}) {
  if (!hubspotMeetingId) throw new Error("HubSpot Appointment ID fehlt.");

  if (outcome === "CANCELED" || outcome === "CANCELLED") {
    await deleteHubSpotAppointment(hubspotMeetingId);
    return null;
  }

  return hubspotFetch(`${APPOINTMENTS_PATH}/${hubspotMeetingId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: appointmentProperties({
        title,
        startTime,
        endTime,
        meetLink,
        ownerId,
        notes,
        outcome,
      }),
    }),
  });
}

export async function deleteHubSpotAppointment(hubspotMeetingId) {
  if (!hubspotMeetingId) return null;
  return hubspotFetch(`${APPOINTMENTS_PATH}/${hubspotMeetingId}`, {
    method: "DELETE",
  });
}

export async function syncHubSpotBooking({ meeting, mitarbeiter, meetLink }) {
  const contact = await findOrCreateContact({
    email: meeting.email,
    firstName: meeting.firstName,
    lastName: meeting.lastName,
    phone: meeting.phone,
    company: meeting.company,
  });
  const owner = await findOwnerByEmail(mitarbeiter.email);

  const hubspotAppointment = await createHubSpotAppointment({
    contactId: contact.id,
    ownerId: owner?.id,
    title: `Meeting mit ${meeting.firstName} ${meeting.lastName}`,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    meetLink,
    notes: `Gebucht via ${process.env.APP_URL || "360 Vista Meeting-System"}`,
  });

  return {
    hubspotContactEmail: meeting.email,
    hubspotMeetingId: hubspotAppointment.id,
    hubspotOwnerEmail: owner?.email || mitarbeiter.email,
  };
}

export async function syncHubSpotUpdate({ meeting, mitarbeiter, meetLink, outcome }) {
  const owner = await findOwnerByEmail(mitarbeiter.email);
  await updateHubSpotMeeting({
    hubspotMeetingId: meeting.hubspotMeetingId,
    ownerId: owner?.id,
    title: `Meeting mit ${meeting.firstName} ${meeting.lastName}`,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    meetLink,
    outcome,
  });

  return {
    hubspotOwnerEmail: owner?.email || mitarbeiter.email,
  };
}
