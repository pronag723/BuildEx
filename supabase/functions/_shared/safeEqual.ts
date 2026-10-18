// Compare a presented secret with the expected one without leaking, through
// timing, how many leading characters were right. (The length can leak; the
// secrets compared here are fixed-length random strings, so that says nothing.)
export function safeEqual(presented: string, expected: string): boolean {
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(expected);
  if (b.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
