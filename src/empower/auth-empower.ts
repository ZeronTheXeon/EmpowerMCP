/**
 * Auth flow for the new Empower site (migrated users).
 *
 * The new Empower site uses a different auth flow than the classic
 * Personal Capital site:
 *
 * 1. POST /api/auth/multiauth/noauth/authenticate (JSON body)
 *    → Returns a JWT idToken
 * 2. POST /api/credential/authenticateToken (multipart/form-data with idToken)
 *    → Returns spHeader with csrf + session cookies
 */

import type { EmpowerSession, EmpowerApiResponse } from "./types.js";
import { EMPOWER_SITES, getSiteConfig } from "./types.js";

/**
 * Extract cookies from Set-Cookie headers in a fetch response.
 */
function extractCookies(response: Response, existingCookies: Record<string, string> = {}): Record<string, string> {
  const cookies = { ...existingCookies };
  const setCookieHeaders = response.headers.getAll?.("set-cookie") ?? [];

  if (setCookieHeaders.length === 0) {
    const single = response.headers.get("set-cookie");
    if (single) {
      setCookieHeaders.push(...single.split(/,(?=\s*\w+=)/));
    }
  }

  for (const cookie of setCookieHeaders) {
    const match = cookie.match(/^([^=]+)=([^;]*)/);
    if (match) {
      cookies[match[1].trim()] = match[2].trim();
    }
  }
  return cookies;
}

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/**
 * Generate a simple device fingerprint string.
 */
function generateFingerprint(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Full auth flow for the new Empower site.
 *
 * Step 1: Authenticate with email+password via multiauth endpoint (JSON).
 * Step 2: Exchange the returned JWT for a session via authenticateToken (multipart).
 */
export async function authenticateNewEmpower(
  email: string,
  password: string,
  baseUrl: string = EMPOWER_SITES.EMPOWER,
): Promise<EmpowerSession> {
  const siteConfig = getSiteConfig(baseUrl);
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  // Step 1: Authenticate with multiauth endpoint
  const authResponse = await fetch(`${baseUrl}/api/auth/multiauth/noauth/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "User-Agent": userAgent,
      "Origin": siteConfig.participantUrl,
      "Referer": `${siteConfig.participantUrl}/`,
    },
    body: JSON.stringify({
      deviceFingerPrint: generateFingerprint(),
      userAgent,
      language: "en-US",
      hasLiedLanguages: false,
      hasLiedResolution: false,
      hasLiedOs: false,
      hasLiedBrowser: false,
      userName: email,
      password,
      flowName: "mfa",
      accu: "Empower",
      requestSrc: "empower_browser",
    }),
    redirect: "manual",
  });

  const authCookies = extractCookies(authResponse);

  if (!authResponse.ok) {
    const text = await authResponse.text();
    throw new Error(`Empower multiauth failed (HTTP ${authResponse.status}): ${text}`);
  }

  const authData = await authResponse.json() as { idToken?: string; error?: string; message?: string };

  if (!authData.idToken) {
    throw new Error(authData.message || authData.error || "Empower multiauth did not return an idToken");
  }

  // Step 2: Exchange JWT for session via authenticateToken
  const tokenForm = new FormData();
  tokenForm.append("idToken", authData.idToken);
  tokenForm.append("apiClient", "WEB");

  const tokenResponse = await fetch(`${baseUrl}/api/credential/authenticateToken`, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "User-Agent": userAgent,
      "Origin": siteConfig.participantUrl,
      "Referer": `${siteConfig.participantUrl}/`,
      "Cookie": buildCookieHeader(authCookies),
    },
    body: tokenForm,
    redirect: "manual",
  });

  const sessionCookies = extractCookies(tokenResponse, authCookies);
  const tokenData = await tokenResponse.json() as EmpowerApiResponse;

  if (!tokenData.spHeader?.success) {
    const errorMsg = tokenData.spHeader?.errors?.map(e => e.message).join("; ") || "authenticateToken failed";
    throw new Error(errorMsg);
  }

  return {
    csrf: tokenData.spHeader.csrf,
    authLevel: tokenData.spHeader.authLevel,
    cookies: sessionCookies,
    baseUrl,
    siteKey: "EMPOWER",
    userGuid: tokenData.spHeader.userGuid,
  };
}
