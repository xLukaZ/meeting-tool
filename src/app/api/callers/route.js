import { NextResponse } from "next/server";
import { requireAdmin, unauthorizedJson } from "@/lib/session";
import { prisma } from "@/lib/db";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  try {
    if (!(await requireAdmin())) return unauthorizedJson();
    const callers = await prisma.caller.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ callers });
  } catch (err) {
    console.error("[callers:get]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await requireAdmin())) return unauthorizedJson();
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name ist Pflichtfeld" }, { status: 400 });
    }
    const caller = await prisma.caller.create({
      data: { name: name.trim(), slug: slugify(name) },
    });
    return NextResponse.json(caller, { status: 201 });
  } catch (err) {
    console.error("[callers:post]", err.message);
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Eine Quelle mit diesem Namen existiert bereits" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!(await requireAdmin())) return unauthorizedJson();
    const { id, name, isActive } = await request.json();
    if (!id) return NextResponse.json({ error: "ID fehlt" }, { status: 400 });

    const data = {};
    if (typeof name === "string" && name.trim()) {
      data.name = name.trim();
      data.slug = slugify(name);
    }
    if (typeof isActive === "boolean") data.isActive = isActive;

    const caller = await prisma.caller.update({ where: { id }, data });
    return NextResponse.json(caller);
  } catch (err) {
    console.error("[callers:patch]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
