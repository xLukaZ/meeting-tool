import { NextResponse } from "next/server";
import { getHubSpotConfigured, saveHubSpotAccessToken } from "@/lib/hubspot";
import { requireAdmin, unauthorizedJson } from "@/lib/session";

export async function GET() {
  try {
    if (!(await requireAdmin())) return unauthorizedJson();
    return NextResponse.json({ configured: await getHubSpotConfigured() });
  } catch (err) {
    console.error("[settings:hubspot:get]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!(await requireAdmin())) return unauthorizedJson();
    const { accessToken } = await request.json();
    await saveHubSpotAccessToken(accessToken);
    return NextResponse.json({ configured: true });
  } catch (err) {
    console.error("[settings:hubspot:patch]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
