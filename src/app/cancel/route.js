import { NextResponse } from "next/server";

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  const redirectUrl = new URL("/umbuchen", request.url);
  if (token) redirectUrl.searchParams.set("token", token);
  return NextResponse.redirect(redirectUrl);
}
