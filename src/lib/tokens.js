import crypto from "crypto";
import { decrypt, encrypt } from "./encrypt";

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) {
    throw new Error("SESSION_SECRET muss gesetzt sein und mindestens 24 Zeichen haben.");
  }
  return secret;
}

export function createPublicToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(String(token), "utf8")
    .digest("hex");
}

export function createMeetingTokens() {
  const confirmationToken = createPublicToken();
  const rescheduleToken = createPublicToken();
  const cancelToken = createPublicToken();

  return {
    raw: {
      confirmationToken,
      rescheduleToken,
      cancelToken,
    },
    hashes: {
      confirmationTokenHash: hashToken(confirmationToken),
      rescheduleTokenHash: hashToken(rescheduleToken),
      cancelTokenHash: hashToken(cancelToken),
    },
    encrypted: {
      encryptedConfirmationToken: encrypt(confirmationToken),
      encryptedRescheduleToken: encrypt(rescheduleToken),
      encryptedCancelToken: encrypt(cancelToken),
    },
  };
}

export function decryptMeetingTokens(meeting) {
  return {
    confirmationToken: decrypt(meeting.encryptedConfirmationToken),
    rescheduleToken: decrypt(meeting.encryptedRescheduleToken),
    cancelToken: decrypt(meeting.encryptedCancelToken),
  };
}
