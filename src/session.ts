import { z } from "zod";
import type { EmpowerSession } from "./empower/types.js";
import { EMPOWER_SITES, EMPOWER_SITE_URLS, getSiteConfig } from "./empower/types.js";

const allowedBaseUrls = [...EMPOWER_SITE_URLS] as [string, ...string[]];

const SessionSchema = z.object({
  csrf: z.string().min(1),
  authLevel: z.string().min(1),
  cookies: z.record(z.string(), z.string()),
  baseUrl: z.enum(allowedBaseUrls),
  siteKey: z.string().optional(),
  userGuid: z.string().optional(),
  expiresAt: z.number().optional(),
});

/**
 * Decode and validate a session from the Authorization header.
 * Expected format: "Bearer <base64_encoded_json>"
 */
export function decodeSession(authHeader: string): EmpowerSession | null {
  try {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;

    const json = atob(match[1]);
    const parsed = JSON.parse(json);

    // Backfill baseUrl for tokens created before multi-site support
    if (!parsed.baseUrl) {
      parsed.baseUrl = EMPOWER_SITES.CLASSIC;
    }

    const result = SessionSchema.safeParse(parsed);

    if (!result.success) return null;
    return result.data as EmpowerSession;
  } catch {
    return null;
  }
}

/**
 * Convert a session to headers needed for Empower API calls.
 * Note: Content-Type is NOT included — the caller sets it based on whether
 * the request uses URL-encoded or multipart/form-data.
 */
export function sessionToHeaders(session: EmpowerSession): Record<string, string> {
  const cookieString = Object.entries(session.cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  const baseUrl = session.baseUrl || EMPOWER_SITES.CLASSIC;
  const siteConfig = getSiteConfig(baseUrl);

  return {
    "Cookie": cookieString,
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Origin": siteConfig.participantUrl,
    "Referer": `${siteConfig.participantUrl}/`,
  };
}

/**
 * Decode a raw base64-encoded session token (without the "Bearer " prefix).
 */
export function decodeToken(token: string): EmpowerSession | null {
  try {
    const json = atob(token);
    const parsed = JSON.parse(json);

    if (!parsed.baseUrl) {
      parsed.baseUrl = EMPOWER_SITES.CLASSIC;
    }

    const result = SessionSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data as EmpowerSession;
  } catch {
    return null;
  }
}

/**
 * Resolve a session from a tool-provided token parameter, falling back to the
 * header-based session getter. The token parameter takes precedence so that
 * callers can provide a fresh token on every tool call without relying on
 * stateful header-based auth.
 */
export function resolveSession(
  token: string | undefined,
  getSession: () => EmpowerSession | null,
): EmpowerSession | null {
  if (token) {
    // Try as raw base64 first, then as "Bearer <token>"
    return decodeToken(token) ?? decodeSession(`Bearer ${token}`) ?? getSession();
  }
  return getSession();
}

/**
 * Encode a session object to a base64 token string.
 */
export function encodeSession(session: EmpowerSession): string {
  return btoa(JSON.stringify(session));
}
