import { NextResponse } from "next/server";
import { requireAdmin, unauthorizedJson } from "@/lib/session";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encrypt";
import { DEFAULT_EMAIL_TEMPLATES, isSmtpConfigured } from "@/lib/mailer";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const employeeSelect = {
  id: true,
  name: true,
  email: true,
  slug: true,
  isActive: true,
  bookingTitle: true,
  bookingIntro: true,
  bookingNote: true,
  disabledWeekdays: true,
  meetingDurationMinutes: true,
  workStartMinutes: true,
  workEndMinutes: true,
  bufferBeforeMinutes: true,
  bufferAfterMinutes: true,
  refreshToken: true,
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  smtpUsername: true,
  smtpPassword: true,
  smtpFromName: true,
  smtpFromEmail: true,
  icsDescription: true,
  emailTemplates: true,
};

function serializeMitarbeiter(person) {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    slug: person.slug || slugify(person.name),
    bookingUrl: `/${person.slug || slugify(person.name)}`,
    isActive: person.isActive,
    bookingTitle: person.bookingTitle,
    bookingIntro: person.bookingIntro,
    bookingNote: person.bookingNote,
    disabledWeekdays: person.disabledWeekdays,
    meetingDurationMinutes: person.meetingDurationMinutes,
    workStartMinutes: person.workStartMinutes,
    workEndMinutes: person.workEndMinutes,
    bufferBeforeMinutes: person.bufferBeforeMinutes,
    bufferAfterMinutes: person.bufferAfterMinutes,
    calendarConnected: Boolean(person.refreshToken),
    smtpConfigured: isSmtpConfigured(person),
    smtpHost: person.smtpHost || "",
    smtpPort: person.smtpPort || 587,
    smtpSecure: person.smtpSecure,
    smtpUsername: person.smtpUsername || "",
    smtpFromName: person.smtpFromName || person.name,
    smtpFromEmail: person.smtpFromEmail || person.email,
    icsDescription: person.icsDescription,
    emailTemplates: {
      ...DEFAULT_EMAIL_TEMPLATES,
      ...(person.emailTemplates && typeof person.emailTemplates === "object"
        ? person.emailTemplates
        : {}),
    },
  };
}

function minutes(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 24 * 60 ? parsed : fallback;
}

function duration(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 15 && parsed <= 240 ? parsed : fallback;
}

async function assertAdmin() {
  const session = await requireAdmin();
  if (!session) return null;
  return session;
}

export async function GET() {
  try {
    if (!(await assertAdmin())) return unauthorizedJson();

    const mitarbeiter = await prisma.mitarbeiter.findMany({
      orderBy: { name: "asc" },
      select: employeeSelect,
    });

    return NextResponse.json({
      mitarbeiter: mitarbeiter.map(serializeMitarbeiter),
    });
  } catch (err) {
    console.error("[team:get]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await assertAdmin())) return unauthorizedJson();

    const { name, email, slug } = await request.json();
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name und E-Mail sind Pflichtfelder" },
        { status: 400 }
      );
    }

    const mitarbeiter = await prisma.mitarbeiter.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        slug: slugify(slug || name),
        smtpFromName: name.trim(),
        smtpFromEmail: email.trim().toLowerCase(),
        emailTemplates: DEFAULT_EMAIL_TEMPLATES,
      },
      select: employeeSelect,
    });

    return NextResponse.json(serializeMitarbeiter(mitarbeiter), { status: 201 });
  } catch (err) {
    console.error("[team:post]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!(await assertAdmin())) return unauthorizedJson();

    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Mitarbeiter-ID fehlt" }, { status: 400 });
    }

    const existing = await prisma.mitarbeiter.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    }

    const data = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.email === "string") data.email = body.email.trim().toLowerCase();
    if (typeof body.slug === "string") data.slug = slugify(body.slug);
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.bookingTitle === "string") data.bookingTitle = body.bookingTitle.trim();
    if (typeof body.bookingIntro === "string") data.bookingIntro = body.bookingIntro.trim();
    if (typeof body.bookingNote === "string") data.bookingNote = body.bookingNote.trim();
    if (typeof body.icsDescription === "string") {
      data.icsDescription = body.icsDescription.trim();
    }
    if (Array.isArray(body.disabledWeekdays)) {
      data.disabledWeekdays = body.disabledWeekdays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    }

    data.meetingDurationMinutes = duration(
      body.meetingDurationMinutes,
      existing.meetingDurationMinutes
    );
    data.workStartMinutes = minutes(body.workStartMinutes, existing.workStartMinutes);
    data.workEndMinutes = minutes(body.workEndMinutes, existing.workEndMinutes);
    data.bufferBeforeMinutes = minutes(
      body.bufferBeforeMinutes,
      existing.bufferBeforeMinutes
    );
    data.bufferAfterMinutes = minutes(body.bufferAfterMinutes, existing.bufferAfterMinutes);

    if (typeof body.smtpHost === "string") data.smtpHost = body.smtpHost.trim() || null;
    if (body.smtpPort !== undefined) data.smtpPort = Number(body.smtpPort) || null;
    if (typeof body.smtpSecure === "boolean") data.smtpSecure = body.smtpSecure;
    if (typeof body.smtpUsername === "string") {
      data.smtpUsername = body.smtpUsername.trim() || null;
    }
    if (typeof body.smtpFromName === "string") {
      data.smtpFromName = body.smtpFromName.trim() || null;
    }
    if (typeof body.smtpFromEmail === "string") {
      data.smtpFromEmail = body.smtpFromEmail.trim().toLowerCase() || null;
    }
    if (typeof body.smtpPassword === "string" && body.smtpPassword.trim()) {
      data.smtpPassword = encrypt(body.smtpPassword.trim());
    }
    if (body.clearSmtpPassword === true) {
      data.smtpPassword = null;
    }
    if (body.emailTemplates && typeof body.emailTemplates === "object") {
      data.emailTemplates = {
        ...DEFAULT_EMAIL_TEMPLATES,
        ...body.emailTemplates,
      };
    }
    if (body.disconnectCalendar === true) {
      data.accessToken = null;
      data.refreshToken = null;
      data.tokenExpiry = null;
    }

    const mitarbeiter = await prisma.mitarbeiter.update({
      where: { id },
      data,
      select: employeeSelect,
    });

    return NextResponse.json(serializeMitarbeiter(mitarbeiter));
  } catch (err) {
    console.error("[team:patch]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
