import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./mcp-server.js";
import { decodeSession, encodeSession } from "./session.js";
import { identifyUser, sendChallenge, authenticateChallenge, authenticatePassword } from "./empower/auth.js";
import type { EmpowerSession } from "./empower/types.js";
import { authPageHtml } from "./ui/auth-page.js";

// CORS headers for all responses
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(body: string | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(body, { ...init, headers });
}

function jsonResponse(data: unknown, status = 200): Response {
  return corsResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
    }

    // Route: GET / — Serve companion auth web UI
    if (path === "/" && request.method === "GET") {
      return new Response(authPageHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...CORS_HEADERS,
        },
      });
    }

    // Route: POST /auth/* — Auth flow proxy endpoints
    if (path.startsWith("/auth/")) {
      return handleAuth(path, request);
    }

    // Route: /mcp — MCP Streamable HTTP endpoint
    if (path === "/mcp") {
      return handleMcp(request);
    }

    return errorResponse("Not found", 404);
  },
};

/**
 * Handle auth proxy endpoints for the companion web UI.
 */
async function handleAuth(path: string, request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const body = await request.json() as Record<string, unknown>;

    switch (path) {
      case "/auth/login": {
        const email = body.email as string;
        const baseUrl = (body.baseUrl as string) || undefined;
        if (!email) return errorResponse("Email is required", 400);

        const result = await identifyUser(email, baseUrl);
        return jsonResponse({
          challengeMethods: result.challengeMethods,
          csrf: result.csrf,
          cookies: result.cookies,
          userStatus: result.userStatus,
        });
      }

      case "/auth/challenge": {
        const { csrf, challengeType, cookies, baseUrl } = body as {
          csrf: string;
          challengeType: string;
          cookies: Record<string, string>;
          baseUrl?: string;
        };
        if (!csrf || !challengeType || !cookies) {
          return errorResponse("csrf, challengeType, and cookies are required", 400);
        }

        const result = await sendChallenge(csrf, challengeType, cookies, baseUrl);
        return jsonResponse({
          csrf: result.csrf,
          cookies: result.cookies,
        });
      }

      case "/auth/verify": {
        const { csrf, challengeType, code, cookies, baseUrl } = body as {
          csrf: string;
          challengeType: string;
          code: string;
          cookies: Record<string, string>;
          baseUrl?: string;
        };
        if (!csrf || !code || !cookies) {
          return errorResponse("csrf, code, and cookies are required", 400);
        }

        const result = await authenticateChallenge(csrf, challengeType || "SMS", code, cookies, baseUrl);
        return jsonResponse({
          csrf: result.csrf,
          authLevel: result.authLevel,
          cookies: result.cookies,
        });
      }

      case "/auth/password": {
        const { csrf, email, password, cookies, baseUrl } = body as {
          csrf: string;
          email: string;
          password: string;
          cookies: Record<string, string>;
          baseUrl?: string;
        };
        if (!csrf || !email || !password || !cookies) {
          return errorResponse("csrf, email, password, and cookies are required", 400);
        }

        const session = await authenticatePassword(csrf, email, password, cookies, baseUrl);
        const token = encodeSession(session);
        return jsonResponse({ session: token });
      }

      default:
        return errorResponse("Unknown auth endpoint", 404);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    return errorResponse(message, 400);
  }
}

/**
 * Handle MCP requests (POST, GET, DELETE /mcp).
 * Extracts the session token from the Authorization header and passes it
 * to the MCP server via a closure.
 */
async function handleMcp(request: Request): Promise<Response> {
  // Extract and validate session from Authorization header
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(
      "Authorization header required. Visit the root URL of this server to get your token.",
      401
    );
  }

  const session = decodeSession(authHeader);
  if (!session) {
    return errorResponse(
      "Invalid token format. Please re-authenticate.",
      401
    );
  }

  // Create a stateless transport for each request (no session ID generation)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Create and connect the MCP server with the decoded session
  const server = createMcpServer(() => session);
  await server.connect(transport);

  try {
    // Let the transport handle the request
    const response = await transport.handleRequest(request);
    return addCorsHeaders(response);
  } finally {
    // Clean up the transport after handling
    await transport.close();
    await server.close();
  }
}
