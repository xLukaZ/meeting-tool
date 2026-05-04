import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/app-url";
import { verifyOAuthState } from "@/lib/oauth-state";
import {
  exchangeCodeForTokens,
  getGoogleProfile,
  handleEmployeeOAuthCallback,
} from "@/lib/google-calendar";
import { requireAdmin, setAdminSession } from "@/lib/session";

function safeInternalPath(value) {
  if (!value || !String(value).startsWith("/")) return "/admin";
  if (String(value).startsWith("//")) return "/admin";
  return value;
}

async function handleAdminLogin(code, callbackUrl) {
  const tokens = await exchangeCodeForTokens(code);
  const profile = await getGoogleProfile(tokens);
  const email = profile.email?.toLowerCase();

  if (!email || !profile.id) {
    return NextResponse.redirect(absoluteUrl("/admin-denied"));
  }

  const existingAdmins = await prisma.adminAccount.findMany({ take: 2 });
  let admin = null;

  if (existingAdmins.length === 0) {
    admin = await prisma.adminAccount.create({
      data: {
        googleEmail: email,
        googleId: profile.id,
        name: profile.name || email,
        lastLoginAt: new Date(),
      },
    });
  } else {
    const existing = existingAdmins.find(
      (item) => item.googleId === profile.id || item.googleEmail === email
    );
    if (!existing || existingAdmins.length > 1) {
      return NextResponse.redirect(absoluteUrl("/admin-denied"));
    }

    admin = await prisma.adminAccount.update({
      where: { id: existing.id },
      data: {
        googleEmail: email,
        googleId: profile.id,
        name: profile.name || existing.name,
        lastLoginAt: new Date(),
      },
    });
  }

  await setAdminSession(admin);
  return NextResponse.redirect(absoluteUrl(safeInternalPath(callbackUrl)));
}

async function handleEmployeeConnect(code, teamMemberId) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.redirect(absoluteUrl("/admin-denied"));
  }

  await handleEmployeeOAuthCallback(code, teamMemberId);
  return NextResponse.redirect(absoluteUrl("/admin?success=kalender_verbunden"));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(absoluteUrl("/admin-denied"));
  }

  try {
    const payload = await verifyOAuthState(state);

    if (payload.action === "admin_login") {
      return handleAdminLogin(code, payload.callbackUrl);
    }

    if (payload.action === "connect_employee" && payload.teamMemberId) {
      return handleEmployeeConnect(code, payload.teamMemberId);
    }

    return NextResponse.redirect(absoluteUrl("/admin-denied"));
  } catch (err) {
    console.error("[oauth-callback]", err.message);
    return NextResponse.redirect(absoluteUrl("/admin-denied"));
  }
}
