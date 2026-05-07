import { createEvent } from "ics";
import nodemailer from "nodemailer";
import { decrypt } from "./encrypt";
import { absoluteUrl } from "./app-url";

export const DEFAULT_EMAIL_COLORS = {
  headerBg:   "#0f172a",
  footerBg:   "#f8fafc",
  confirmBtn: "#6b21a8",
  meetBtn:    "#2563eb",
};

export const DEFAULT_EMAIL_TEMPLATES = {
  booking: {
    subject: "Ihr Meeting mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} wurde eingetragen.\nDatum: {{datum}}\nGoogle Meet: {{meetLink}}\n\nBitte bestätigen Sie den Termin: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  reminderUnconfirmed: {
    subject: "Bitte bestätigen Sie Ihren Termin mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin am {{datum}} ist noch nicht bestätigt.\nGoogle Meet: {{meetLink}}\n\nBestätigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
  },
  reminderConfirmed: {
    subject: "Erinnerung: Ihr Termin mit {{mitarbeiterName}}",
    body:
      "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} findet am {{datum}} statt.\nGoogle Meet: {{meetLink}}",
  },
  reschedule: {
    subject: "Ihr Meeting wurde auf {{datum}} verschoben",
    body:
      "Hallo {{firstName}},\n\nIhr Termin mit {{mitarbeiterName}} wurde umgebucht.\nNeuer Termin: {{datum}}\nGoogle Meet: {{meetLink}}\n\nBestätigen: {{confirmLink}}\nUmbuchen: {{rescheduleLink}}\nStornieren: {{cancelLink}}",
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
    throw new Error(`SMTP für ${mitarbeiter.name} ist noch nicht konfiguriert.`);
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

function dateArray(date) {
  const value = new Date(date);
  return [
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
    value.getUTCHours(),
    value.getUTCMinutes(),
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
        description: mitarbeiter.icsDescription || "Ihr Termin mit 360 Vista findet per Google Meet statt.",
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

export function renderEmailPreview({ body, meetLink = "", confirmLink = "", rescheduleLink = "", cancelLink = "", colors }) {
  return renderHtml({ body, meetLink, links: { confirmLink, rescheduleLink, cancelLink }, colors });
}

function renderHtml({ body, meetLink, links, colors }) {
  const c = { ...DEFAULT_EMAIL_COLORS, ...colors };
  const bodyHtml = escapeHtml(body).replace(/\n/g, "<br>");

  const confirmBtn = links.confirmLink
    ? `<a href="${escapeHtml(links.confirmLink)}" style="display:inline-block;background:${c.confirmBtn};color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin-right:10px;margin-bottom:8px">Termin bestätigen</a>`
    : "";

  // Single combined button — links to reschedule; cancel is accessible from that page
  const manageBtnHref = links.rescheduleLink || links.cancelLink;
  const manageBtn = manageBtnHref
    ? `<a href="${escapeHtml(manageBtnHref)}" style="display:inline-block;background:#ffffff;color:#475569;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;border:1px solid #cbd5e1;margin-bottom:8px">Umbuchen / Stornieren</a>`
    : "";

  const meetBtn = meetLink
    ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
        <tr>
          <td style="background:${c.meetBtn};border-radius:8px">
            <a href="${escapeHtml(meetLink)}" style="display:inline-block;color:#ffffff;padding:13px 24px;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px">
              Google Meet öffnen
            </a>
          </td>
        </tr>
      </table>`
    : "";

  const actionButtons = confirmBtn || manageBtn
    ? `<div style="margin-top:20px;margin-bottom:4px">${confirmBtn}${manageBtn}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:${c.headerBg};border-radius:12px 12px 0 0;padding:28px 36px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <span style="color:#ffffff;font-family:Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px">360 Vista</span>
                </td>
                <td align="right">
                  <a href="https://360-vista.de" style="color:#94a3b8;font-family:Arial,sans-serif;font-size:13px;text-decoration:none">360-vista.de</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
            <div style="font-family:Arial,sans-serif;font-size:16px;color:#1e293b;line-height:1.65">
              ${bodyHtml}
            </div>
            ${meetBtn}
            ${actionButtons}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:${c.footerBg};border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:20px 36px">
            <p style="font-family:Arial,sans-serif;font-size:12px;color:#94a3b8;margin:0;line-height:1.6">
              Diese Nachricht wurde automatisch von <strong style="color:#64748b">360 Vista</strong> versendet.
              Besuchen Sie uns auf <a href="https://360-vista.de" style="color:#64748b;text-decoration:none;font-weight:700">360-vista.de</a>.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
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
    html: renderHtml({ body, meetLink, links, colors: mitarbeiter.emailColors }),
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
