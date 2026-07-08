function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function relayRequest(
  method: "GET" | "POST",
  pathname: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const base = required("PAYOUT_RELAY_URL").replace(/\/+$/, "");
  const secret = required("PAYOUT_RELAY_SHARED_SECRET");
  const raw = body == null ? "" : JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256(raw);
  const message = `${timestamp}.${nonce}.${method}.${pathname}.${bodyHash}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );

  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-BuildEx-Timestamp": timestamp,
      "X-BuildEx-Nonce": nonce,
      "X-BuildEx-Signature": signature,
    },
    body: method === "POST" ? raw : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Payout relay failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return (data || {}) as Record<string, unknown>;
}

export async function payoutIdempotencyKey(ids: string[]): Promise<string> {
  return sha256([...ids].sort().join(","));
}
