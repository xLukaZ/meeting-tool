import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauth-state";
import {
  EMPLOYEE_GOOGLE_SCOPES,
  getGoogleAuthUrl,
} from "@/lib/google-calendar";
import { requireAdmin, unauthorizedJson } from "@/lib/session";

export async function GET(request) {
  const session = await requireAdmin();
  if (!session) return unauthorizedJson();

  const mitarbeiterId = new URL(request.url).searchParams.get("mitarbeiterId");
  if (!mitarbeiterId) {
    return NextResponse.json({ error: "mitarbeiterId fehlt" }, { status: 400 });
  }

  const state = await createOAuthState({
    action: "connect_employee",
    teamMemberId: mitarbeiterId,
    callbackUrl: "/admin",
  });

  return NextResponse.redirect(
    getGoogleAuthUrl({ state, scopes: EMPLOYEE_GOOGLE_SCOPES })
  );
}
