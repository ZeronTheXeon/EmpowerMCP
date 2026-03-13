/**
 * Auth flow proxy helpers for the companion web UI.
 *
 * Authentication flow (endpoints, parameters, CSRF handling) derived from:
 * - https://github.com/haochi/personalcapital (MIT License)
 * - https://github.com/ChocoTonic/personalcapital-py (MIT License)
 *
 * See THIRD-PARTY-NOTICES.md for full license texts.
 *
 * SECURITY NOTE: This module proxies credentials (email, password, 2FA codes)
 * directly to Empower's API. Credentials are NEVER logged, stored, or cached
 * on the Worker. They pass through in-memory only for the duration of the request.
 */

import type { EmpowerSession, IdentifyResponse } from "./types.js";
import { EMPOWER_SITES } from "./types.js";

function makeHeaders(baseUrl: string): Record<string, string> {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Origin": baseUrl,
    "Referer": `${baseUrl}/`,
  };
}

/**
 * Extract cookies from Set-Cookie headers in a fetch response.
 */
function extractCookies(response: Response, existingCookies: Record<string, string> = {}): Record<string, string> {
  const cookies = { ...existingCookies };
  const setCookieHeaders = response.headers.getAll?.("set-cookie") ?? [];

  // Fallback: some runtimes don't support getAll
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

/**
 * Build a Cookie header string from a cookies record.
 */
function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/**
 * Get initial CSRF token by loading the home page.
 */
async function getInitialCsrf(baseUrl: string): Promise<{ csrf: string; cookies: Record<string, string> }> {
  const headers = makeHeaders(baseUrl);
  const response = await fetch(`${baseUrl}/page/login/goHome`, {
    headers: {
      "User-Agent": headers["User-Agent"],
    },
    redirect: "manual",
  });

  const cookies = extractCookies(response);
  const body = await response.text();

  // Extract CSRF token from page HTML
  // Newer Empower uses: window.csrf = '<token>'
  // Older versions used: globals.csrf='<token>'
  const csrfMatch = body.match(/window\.csrf\s*=\s*'([a-f0-9-]+)'/) ||
                     body.match(/globals\.csrf='([a-f0-9-]+)'/);
  if (!csrfMatch) {
    throw new Error("Failed to extract initial CSRF token from Empower");
  }

  return { csrf: csrfMatch[1], cookies };
}

/**
 * Step 1: Identify user by email.
 * POST /api/login/identifyUser
 */
export async function identifyUser(email: string, baseUrl: string = EMPOWER_SITES.CLASSIC): Promise<IdentifyResponse> {
  const { csrf, cookies: initialCookies } = await getInitialCsrf(baseUrl);
  const apiBase = `${baseUrl}/api`;
  const headers = makeHeaders(baseUrl);

  const body = new URLSearchParams({
    username: email,
    csrf,
    apiClient: "WEB",
    bindDevice: "false",
    skipLinkAccount: "false",
    skipFirstUse: "",
    redirectTo: "",
    referrerId: "",
  });

  const response = await fetch(`${apiBase}/login/identifyUser`, {
    method: "POST",
    headers: {
      ...headers,
      "Cookie": buildCookieHeader(initialCookies),
    },
    body: body.toString(),
    redirect: "manual",
  });

  const cookies = extractCookies(response, initialCookies);
  const data = await response.json() as { spHeader: { csrf: string; userGuid?: string; userStatus?: string; authLevel: string; success: boolean; errors?: Array<{ message: string }> }; spData?: Record<string, unknown> };

  if (!data.spHeader?.success) {
    const errorMsg = data.spHeader?.errors?.map((e: { message: string }) => e.message).join("; ") || "Failed to identify user";
    throw new Error(errorMsg);
  }

  // Determine available challenge methods
  const challengeMethods: string[] = [];
  const authLevel = data.spHeader.authLevel;

  if (authLevel === "USER_REMEMBERED") {
    // No 2FA needed, can proceed directly to password
    challengeMethods.push("NONE");
  } else {
    // 2FA required - both SMS and Email are typically available
    challengeMethods.push("SMS", "EMAIL");
  }

  return {
    csrf: data.spHeader.csrf,
    challengeMethods,
    cookies,
    userGuid: data.spHeader.userGuid,
    userStatus: data.spHeader.userStatus,
  };
}

/**
 * Step 2: Send 2FA challenge (SMS or Email).
 * POST /api/credential/challengeSms or /api/credential/challengeEmail
 */
export async function sendChallenge(
  csrf: string,
  challengeType: string,
  cookies: Record<string, string>,
  baseUrl: string = EMPOWER_SITES.CLASSIC
): Promise<{ csrf: string; cookies: Record<string, string> }> {
  const apiBase = `${baseUrl}/api`;
  const headers = makeHeaders(baseUrl);
  const endpoint = challengeType === "SMS"
    ? "/credential/challengeSms"
    : "/credential/challengeEmail";

  const challengeTypeParam = challengeType === "SMS" ? "challengeSMS" : "challengeEmail";

  const body = new URLSearchParams({
    csrf,
    apiClient: "WEB",
    challengeReason: "DEVICE_AUTH",
    challengeMethod: "OP",
    challengeType: challengeTypeParam,
    bindDevice: "false",
  });

  const response = await fetch(`${apiBase}${endpoint}`, {
    method: "POST",
    headers: {
      ...headers,
      "Cookie": buildCookieHeader(cookies),
    },
    body: body.toString(),
    redirect: "manual",
  });

  const updatedCookies = extractCookies(response, cookies);
  const data = await response.json() as { spHeader: { csrf: string; success: boolean; errors?: Array<{ message: string }> } };

  if (!data.spHeader?.success) {
    const errorMsg = data.spHeader?.errors?.map((e: { message: string }) => e.message).join("; ") || "Failed to send challenge";
    throw new Error(errorMsg);
  }

  return {
    csrf: data.spHeader.csrf,
    cookies: updatedCookies,
  };
}

/**
 * Step 3: Verify 2FA code.
 * POST /api/credential/authenticateSms or /api/credential/authenticateEmailByCode
 */
export async function authenticateChallenge(
  csrf: string,
  challengeType: string,
  code: string,
  cookies: Record<string, string>,
  baseUrl: string = EMPOWER_SITES.CLASSIC
): Promise<{ csrf: string; authLevel: string; cookies: Record<string, string> }> {
  const apiBase = `${baseUrl}/api`;
  const headers = makeHeaders(baseUrl);
  const endpoint = challengeType === "SMS"
    ? "/credential/authenticateSms"
    : "/credential/authenticateEmailByCode";

  const body = new URLSearchParams({
    csrf,
    apiClient: "WEB",
    code,
    challengeReason: "DEVICE_AUTH",
    challengeMethod: "OP",
    bindDevice: "false",
  });

  const response = await fetch(`${apiBase}${endpoint}`, {
    method: "POST",
    headers: {
      ...headers,
      "Cookie": buildCookieHeader(cookies),
    },
    body: body.toString(),
    redirect: "manual",
  });

  const updatedCookies = extractCookies(response, cookies);
  const data = await response.json() as { spHeader: { csrf: string; authLevel: string; success: boolean; errors?: Array<{ message: string }> } };

  if (!data.spHeader?.success) {
    const errorMsg = data.spHeader?.errors?.map((e: { message: string }) => e.message).join("; ") || "Failed to verify code";
    throw new Error(errorMsg);
  }

  return {
    csrf: data.spHeader.csrf,
    authLevel: data.spHeader.authLevel,
    cookies: updatedCookies,
  };
}

/**
 * Step 4: Authenticate with password.
 * POST /api/credential/authenticatePassword
 * Returns a fully authenticated session.
 */
export async function authenticatePassword(
  csrf: string,
  email: string,
  password: string,
  cookies: Record<string, string>,
  baseUrl: string = EMPOWER_SITES.CLASSIC
): Promise<EmpowerSession> {
  const apiBase = `${baseUrl}/api`;
  const headers = makeHeaders(baseUrl);

  const body = new URLSearchParams({
    csrf,
    apiClient: "WEB",
    username: email,
    passwd: password,
    bindDevice: "true",
    deviceName: "",
    skipLinkAccount: "false",
    skipFirstUse: "",
    redirectTo: "",
    referrerId: "",
  });

  const response = await fetch(`${apiBase}/credential/authenticatePassword`, {
    method: "POST",
    headers: {
      ...headers,
      "Cookie": buildCookieHeader(cookies),
    },
    body: body.toString(),
    redirect: "manual",
  });

  const updatedCookies = extractCookies(response, cookies);
  const data = await response.json() as { spHeader: { csrf: string; authLevel: string; userGuid?: string; success: boolean; errors?: Array<{ message: string }> } };

  if (!data.spHeader?.success) {
    const errorMsg = data.spHeader?.errors?.map((e: { message: string }) => e.message).join("; ") || "Failed to authenticate";
    throw new Error(errorMsg);
  }

  return {
    csrf: data.spHeader.csrf,
    authLevel: data.spHeader.authLevel,
    cookies: updatedCookies,
    baseUrl,
    userGuid: data.spHeader.userGuid,
  };
}
