import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauth-state";
import { getGoogleAuthUrl, ADMIN_GOOGLE_SCOPES } from "@/lib/google-calendar";

export async function GET(request) {
  const callbackUrl = new URL(request.url).searchParams.get("callbackUrl") || "/admin";
  const state = await createOAuthState({
    action: "admin_login",
    callbackUrl,
  });

  return NextResponse.redirect(
    getGoogleAuthUrl({ state, scopes: ADMIN_GOOGLE_SCOPES })
  );
}
