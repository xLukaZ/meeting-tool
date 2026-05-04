import { NextResponse } from "next/server";

export async function GET(request) {
  const callbackUrl = new URL(request.url).searchParams.get("callbackUrl") || "/admin";
  return NextResponse.redirect(
    new URL(`/api/admin/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, request.url)
  );
}

export async function POST(request) {
  return GET(request);
}
