import crypto from "crypto";
import { cookies } from "next/headers";

const OAUTH_CSRF_COOKIE = "vista_oauth_csrf";
const STATE_TTL_SECONDS = 10 * 60;

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

function encodeState(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function decodeState(state) {
  const [encodedPayload, signature] = String(state || "").split(".");
  if (!encodedPayload || !signature) throw new Error("OAuth-State fehlt oder ist ungültig.");

  const expected = sign(encodedPayload);
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    throw new Error("OAuth-State Signatur ist ungültig.");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("OAuth-State ist abgelaufen.");
  }
  return payload;
}

function isSecureCookie() {
  return (process.env.APP_URL || "").startsWith("https://");
}

export async function createOAuthState({ action, teamMemberId, callbackUrl }) {
  const csrf = crypto.randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_CSRF_COOKIE, csrf, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    maxAge: STATE_TTL_SECONDS,
    path: "/",
  });

  return encodeState({
    action,
    teamMemberId: teamMemberId || null,
    callbackUrl: callbackUrl || "/admin",
    csrf,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  });
}

export async function verifyOAuthState(state) {
  const payload = decodeState(state);
  const cookieStore = await cookies();
  const csrf = cookieStore.get(OAUTH_CSRF_COOKIE)?.value;
  cookieStore.delete(OAUTH_CSRF_COOKIE);

  if (!csrf || csrf !== payload.csrf) {
    throw new Error("OAuth-CSRF-Prüfung fehlgeschlagen.");
  }

  return payload;
}
