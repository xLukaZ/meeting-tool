import { createEvent } from "ics";
import nodemailer from "nodemailer";
import { decrypt } from "./encrypt";
import { absoluteUrl } from "./app-url";

export const DEFAULT_EMAIL_TEMPLATES = {
  booking: {
    subject: "Ihr Meeting mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} wurde eingetragen.\nDatum: {{datum}}\nGoogle Meet: {{meetLink}}\n\nBitte bestaetigen Sie den Termin: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  reminderUnconfirmed: {
    subject: "Bitte bestaetigen Sie Ihren Termin mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin am {{datum}} ist noch nicht bestaetigt.\nGoogle Meet: {{meetLink}}\n\nBestaetigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  reminderConfirmed: {
    subject: "Erinnerung: Ihr Termin mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} findet am {{datum}} statt.\nGoogle Meet: {{meetLink}}",
  },
  reschedule: {
    subject: "Ihr Meeting wurde auf {{datum}} verschoben",
    body:
      "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} wurde umgebucht.\nNeuer Termin: {{datum}}\nGoogle Meet: {{meetLink}}\n\nBestaetigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  cancellation: {
    subject: "Ihr Meeting vom {{datum}} wurde storniert",
    body:
      "Hallo {{firstName}},\n\nder Termin mit {{mitarbeiterName}} am {{datum}} wurde storniert.\n{{reason}}",
  },
};

function formatDate(isoString) {
  return new Date(isoString).toLocaleString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTemplate(template, values) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value == null ? "" : String(value)),
    template
  );
}

function getTemplates(mitarbeiter) {
  return {
    ...DEFAULT_EMAIL_TEMPLATES,
    ...(mitarbeiter.emailTemplates && typeof mitarbeiter.emailTemplates === "object"
      ? mitarbeiter.emailTemplates
      : {}),
  };
}

export function isSmtpConfigured(mitarbeiter) {
  return Boolean(
    mitarbeiter?.smtpHost &&
      mitarbeiter.smtpPort &&
      mitarbeiter.smtpUsername &&
      mitarbeiter.smtpPassword &&
      mitarbeiter.smtpFromEmail
  );
}

function getTransport(mitarbeiter) {
  if (!isSmtpConfigured(mitarbeiter)) {
    throw new Error(`SMTP fuer ${mitarbeiter.name} ist noch nicht konfiguriert.`);
  }

  return nodemailer.createTransport({
    host: mitarbeiter.smtpHost,
    port: mitarbeiter.smtpPort,
    secure: mitarbeiter.smtpSecure,
    auth: {
      user: mitarbeiter.smtpUsername,
      pass: decrypt(mitarbeiter.smtpPassword),
    },
  });
}

function dateArray(date, utc = true) {
  const value = new Date(date);
  if (utc) {
    return [
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
    ];
  }

  return [
    value.getFullYear(),
    value.getMonth() + 1,
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
  ];
}

async function generateICS({ meeting, mitarbeiter, meetLink }) {
  const title = `Meeting mit ${mitarbeiter.name} - 360 Vista`;

  return new Promise((resolve, reject) => {
    createEvent(
      {
        uid: meeting.id,
        title,
        start: dateArray(meeting.startTime),
        end: dateArray(meeting.endTime),
        startInputType: "utc",
        endInputType: "utc",
        description: mitarbeiter.icsDescription || DEFAULT_EMAIL_TEMPLATES.booking.body,
        location: meetLink || "",
        status: "CONFIRMED",
        organizer: {
          name: mitarbeiter.smtpFromName || mitarbeiter.name,
          email: mitarbeiter.smtpFromEmail || mitarbeiter.email,
        },
        attendees: [
          {
            name: `${meeting.firstName} ${meeting.lastName}`.trim(),
            email: meeting.email,
            rsvp: false,
            partstat: "ACCEPTED",
            role: "REQ-PARTICIPANT",
          },
        ],
      },
      (error, value) => {
        if (error) reject(error);
        else resolve(value);
      }
    );
  });
}

function buildLinks(tokens) {
  return {
    confirmLink: tokens?.confirmationToken
      ? absoluteUrl(`/confirm?token=${encodeURIComponent(tokens.confirmationToken)}`)
      : "",
    rescheduleLink: tokens?.rescheduleToken
      ? absoluteUrl(`/umbuchen?token=${encodeURIComponent(tokens.rescheduleToken)}`)
      : "",
    cancelLink: tokens?.cancelToken
      ? absoluteUrl(`/cancel?token=${encodeURIComponent(tokens.cancelToken)}`)
      : "",
  };
}

function templateValues({ meeting, mitarbeiter, meetLink, tokens, reason }) {
  return {
    firstName: meeting.firstName,
    lastName: meeting.lastName,
    mitarbeiterName: mitarbeiter.name,
    datum: formatDate(meeting.startTime),
    meetLink: meetLink || "",
    reason: reason ? `Grund: ${reason}` : "",
    ...buildLinks(tokens),
  };
}

function renderHtml({ body, meetLink, links }) {
  const bodyHtml = escapeHtml(body).replace(/\n/g, "<br>");
  const buttons = [
    links.confirmLink && ["Bestaetigen", links.confirmLink],
    links.rescheduleLink && ["Umbuchen", links.rescheduleLink],
    links.cancelLink && ["Stornieren", links.cancelLink],
  ].filter(Boolean);

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18202f;line-height:1.55">
      <div>${bodyHtml}</div>
      ${
        meetLink
          ? `<p style="margin:22px 0"><a href="${escapeHtml(meetLink)}" style="display:inline-block;background:#172033;color:#fff;padding:11px 16px;border-radius:6px;text-decoration:none">Google Meet oeffnen</a></p>`
          : ""
      }
      ${
        buttons.length
          ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:20px 0">${buttons
              .map(
                ([label, href]) =>
                  `<a href="${escapeHtml(href)}" style="display:inline-block;border:1px solid #cbd5e1;color:#172033;padding:9px 13px;border-radius:6px;text-decoration:none">${label}</a>`
              )
              .join("")}</div>`
          : ""
      }
      <p style="font-size:12px;color:#667085;margin-top:26px">360 Vista Meeting-System</p>
    </div>
  `;
}

async function sendEmployeeMail({
  mitarbeiter,
  to,
  subject,
  body,
  meeting,
  meetLink,
  tokens,
  includeIcs = true,
}) {
  const transport = getTransport(mitarbeiter);
  const links = buildLinks(tokens);
  const attachments = [];

  if (includeIcs) {
    const ics = await generateICS({ meeting, mitarbeiter, meetLink });
    attachments.push({
      filename: "termin.ics",
      content: ics,
      contentType: "text/calendar; charset=utf-8; method=PUBLISH",
    });
  }

  await transport.sendMail({
    from: `"${mitarbeiter.smtpFromName || mitarbeiter.name}" <${mitarbeiter.smtpFromEmail}>`,
    to,
    subject,
    text: body,
    html: renderHtml({ body, meetLink, links }),
    attachments,
  });
}

export async function sendBookingEmail({ meeting, mitarbeiter, meetLink, tokens }) {
  const templates = getTemplates(mitarbeiter);
  const template = templates.booking || DEFAULT_EMAIL_TEMPLATES.booking;
  const values = templateValues({ meeting, mitarbeiter, meetLink, tokens });

  await sendEmployeeMail({
    mitarbeiter,
    to: meeting.email,
    subject: renderTemplate(template.subject, values),
    body: renderTemplate(template.body, values),
    meeting,
    meetLink,
    tokens,
  });
}

export async function sendRescheduleEmail({ meeting, mitarbeiter, meetLink, tokens }) {
  const templates = getTemplates(mitarbeiter);
  const template = templates.reschedule || DEFAULT_EMAIL_TEMPLATES.reschedule;
  const values = templateValues({ meeting, mitarbeiter, meetLink, tokens });

  await sendEmployeeMail({
    mitarbeiter,
    to: meeting.email,
    subject: renderTemplate(template.subject, values),
    body: renderTemplate(template.body, values),
    meeting,
    meetLink,
    tokens,
  });
}

export async function sendReminderEmail({ meeting, mitarbeiter, meetLink, tokens }) {
  const templates = getTemplates(mitarbeiter);
  const key = meeting.confirmedAt ? "reminderConfirmed" : "reminderUnconfirmed";
  const template = templates[key] || DEFAULT_EMAIL_TEMPLATES[key];
  const values = templateValues({ meeting, mitarbeiter, meetLink, tokens });

  await sendEmployeeMail({
    mitarbeiter,
    to: meeting.email,
    subject: renderTemplate(template.subject, values),
    body: renderTemplate(template.body, values),
    meeting,
    meetLink,
    tokens: meeting.confirmedAt ? null : tokens,
    includeIcs: !meeting.confirmedAt,
  });
}

export async function sendCancellationEmail({ meeting, mitarbeiter, reason }) {
  const templates = getTemplates(mitarbeiter);
  const template = templates.cancellation || DEFAULT_EMAIL_TEMPLATES.cancellation;
  const values = templateValues({ meeting, mitarbeiter, reason });

  await sendEmployeeMail({
    mitarbeiter,
    to: meeting.email,
    subject: renderTemplate(template.subject, values),
    body: renderTemplate(template.body, values),
    meeting,
    meetLink: "",
    tokens: null,
    includeIcs: false,
  });
}
