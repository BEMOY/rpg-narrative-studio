// Supabase Auth only speaks email/phone. We let people register with a plain nickname
// (B3MOY, dbrvln, …) by mapping it onto a synthetic address under a domain reserved by
// IANA specifically for "this will never be a real domain" (RFC 2606) — safer than an
// arbitrary made-up TLD like .local, which some validators special-case.
// This requires "Confirm email" to be OFF in the Supabase project's Auth settings —
// a fake domain can never receive a confirmation mail. Invite codes are the actual gate,
// so email verification isn't needed anyway.
const FAKE_DOMAIN = "rpg-narrative-studio.invalid";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
}

export function usernameToEmail(raw: string): string {
  return `${normalizeUsername(raw)}@${FAKE_DOMAIN}`;
}

export function isValidUsername(raw: string): boolean {
  const n = normalizeUsername(raw);
  return n.length >= 3 && n.length <= 32;
}
