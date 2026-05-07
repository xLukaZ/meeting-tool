// GET /api/availability?mitarbeiterId=xxx&dateFrom=2025-06-10&dateTo=2025-06-17
// Gibt freie 30-min Slots zurück

import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/google-calendar";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mitarbeiterId = searchParams.get("mitarbeiterId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (!mitarbeiterId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "mitarbeiterId, dateFrom und dateTo sind Pflichtfelder" },
        { status: 400 }
      );
    }

    const slots = await getAvailableSlots(
      mitarbeiterId,
      new Date(dateFrom),
      new Date(dateTo)
    );

    return NextResponse.json({ slots });
  } catch (err) {
    console.error("[availability]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
