/**
 * Claude sometimes wraps a JSON response in a markdown code fence
 * (```json ... ``` or ``` ... ```) even when explicitly told not to —
 * confirmed live, not hypothetical: it's what broke pricebook seeding
 * the first time this app ever made a real AI call. Every AI feature that
 * expects a raw JSON response should parse through this first.
 */
export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : trimmed;
}
