// GET /api/meetings?status=ACTIVE&mitarbeiterId=xxx&limit=50
// Für das Admin-Dashboard

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, unauthorizedJson } from "@/lib/session";

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
        mitarbeiter: { select: { name: true, email: true } },
      },
    });

    // Heute-Statistik
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCount = await prisma.meetingToken.count({
      where: {
        startTime: { gte: today, lt: tomorrow },
        status: { in: ["PENDING", "CONFIRMED", "RESCHEDULED"] },
      },
    });

    return NextResponse.json({ meetings, stats: { today: todayCount } });
  } catch (err) {
    console.error("[meetings]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
