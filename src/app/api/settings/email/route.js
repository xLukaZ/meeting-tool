import { NextResponse } from "next/server";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/mailer";
import { requireAdmin, unauthorizedJson } from "@/lib/session";

export async function GET() {
  if (!(await requireAdmin())) return unauthorizedJson();
  return NextResponse.json({ templates: DEFAULT_EMAIL_TEMPLATES });
}
