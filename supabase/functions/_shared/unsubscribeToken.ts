// Signed one-click unsubscribe tokens for message-notification emails.
//
// A token is `<user id>.<base64url HMAC-SHA256(UNSUBSCRIBE_SECRET, purpose + id)>`.
// Holding one proves you received an email addressed to that account, which is
// all an opt-out needs — so it works without signing in, from any device, and
// never expires (an unsubscribe link in a year-old email must still work).
//
// The purpose prefix ties the signature to this one use: the same secret can
// never be replayed to authorise something else. Rotating UNSUBSCRIBE_SECRET
// invalidates every link already sent.
//
// Plain Web Crypto, so the same file runs in Deno (Edge Functions) and in Node
// (tests/message-emails.test.mjs).

const PURPOSE = "buildex:email-unsubscribe:v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Return type left to inference: a freshly allocated Uint8Array is what Web
// Crypto's BufferSource wants under both older and newer TypeScript libs.
function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET is not set");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signUnsubscribeToken(userId: string, secret: string): Promise<string> {
  const id = String(userId).toLowerCase();
  if (!UUID.test(id)) throw new Error("Not a user id");
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    encoder.encode(PURPOSE + id),
  );
  return `${id}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The user id the token was issued for, or null if it is malformed or forged. */
export async function verifyUnsubscribeToken(token: unknown, secret: string): Promise<string | null> {
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const id = parts[0].toLowerCase();
  if (!UUID.test(id)) return null;
  const signature = fromBase64Url(parts[1]);
  if (!signature) return null;
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    signature,
    encoder.encode(PURPOSE + id),
  );
  return valid ? id : null;
}
