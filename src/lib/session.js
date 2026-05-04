import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "vista_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("SESSION_SECRET muss gesetzt sein und mindestens 24 Zeichen haben.");
  }
  return secret;
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function encodeSession(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function decodeSession(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function isSecureCookie() {
  return (process.env.APP_URL || "").startsWith("https://");
}

export async function setAdminSession(admin) {
  const cookieStore = await cookies();
  const now = Math.floor(Date.now() / 1000);
  const token = encodeSession({
    adminId: admin.id,
    googleEmail: admin.googleEmail,
    googleId: admin.googleId,
    exp: now + SESSION_TTL_SECONDS,
  });

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return decodeSession(token);
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) return null;
  return session;
}

export function unauthorizedJson() {
  return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
}
