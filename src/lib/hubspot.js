import { prisma } from "./db";
import { decrypt, encrypt } from "./encrypt";

const HUBSPOT_BASE = "https://api.hubapi.com";
const GLOBAL_SETTINGS_ID = "global";

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
        phone: phone || "",
        company: company || "",
      },
    }),
  });
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

function meetingProperties({ title, startTime, endTime, meetLink, ownerId, notes, outcome }) {
  return {
    hs_timestamp: new Date(startTime).getTime().toString(),
    hs_meeting_title: title,
    hs_meeting_start_time: new Date(startTime).toISOString(),
    hs_meeting_end_time: new Date(endTime).toISOString(),
    hs_meeting_external_url: meetLink || "",
    hs_meeting_location: meetLink ? "Google Meet" : "",
    hs_meeting_outcome: outcome || "SCHEDULED",
    hs_internal_meeting_notes: notes || "",
    ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
  };
}

export async function createHubSpotMeeting({
  contactId,
  ownerId,
  title,
  startTime,
  endTime,
  meetLink,
  notes,
}) {
  return hubspotFetch("/crm/v3/objects/meetings", {
    method: "POST",
    body: JSON.stringify({
      properties: meetingProperties({
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
              associationTypeId: 200,
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
  if (!hubspotMeetingId) throw new Error("HubSpot Meeting ID fehlt.");

  return hubspotFetch(`/crm/v3/objects/meetings/${hubspotMeetingId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: meetingProperties({
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

export async function syncHubSpotBooking({ meeting, mitarbeiter, meetLink }) {
  const contact = await findOrCreateContact({
    email: meeting.email,
    firstName: meeting.firstName,
    lastName: meeting.lastName,
    phone: meeting.phone,
    company: meeting.company,
  });
  const owner = await findOwnerByEmail(mitarbeiter.email);

  const hubspotMeeting = await createHubSpotMeeting({
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
    hubspotMeetingId: hubspotMeeting.id,
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
