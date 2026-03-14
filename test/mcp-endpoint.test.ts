import { describe, it, expect } from "vitest";
import worker from "../src/index.js";

/** Helper to send a request to the worker. */
function send(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body) init.body = JSON.stringify(body);
  return worker.fetch(new Request(`http://localhost${path}`, init));
}

function jsonRpc(method: string, id: number, params?: unknown) {
  return { jsonrpc: "2.0", method, id, params: params ?? {} };
}

const INITIALIZE_PARAMS = {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "test-client", version: "1.0.0" },
};

// ---------------------------------------------------------------------------
// HTTP method handling on /mcp
// ---------------------------------------------------------------------------
describe("MCP endpoint — HTTP methods", () => {
  it("returns 405 for GET /mcp (SSE not supported per MCP spec)", async () => {
    const res = await send("GET", "/mcp", undefined, { Accept: "text/event-stream" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("returns 405 for DELETE /mcp (stateless, no sessions to terminate)", async () => {
    const res = await send("DELETE", "/mcp");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("returns 204 for OPTIONS /mcp (CORS preflight)", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/mcp", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// CORS headers (required for Claude.ai browser-based connectors)
// ---------------------------------------------------------------------------
describe("MCP endpoint — CORS headers", () => {
  it("includes required CORS headers on POST /mcp", async () => {
    const res = await send("POST", "/mcp", jsonRpc("initialize", 1, INITIALIZE_PARAMS));

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("MCP-Protocol-Version");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Mcp-Session-Id");
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("Mcp-Session-Id");
  });

  it("includes CORS headers on 405 GET /mcp", async () => {
    const res = await send("GET", "/mcp");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("includes CORS headers on OPTIONS preflight", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/mcp", { method: "OPTIONS" }),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

// ---------------------------------------------------------------------------
// MCP protocol — unauthenticated connection (Claude Code + Claude.ai)
//
// Both Claude Code and Claude.ai connectors send:
//   POST /mcp  { "method": "initialize", ... }
// without an Authorization header when first connecting.
// The server MUST respond 200 with serverInfo + capabilities.
// ---------------------------------------------------------------------------
describe("MCP endpoint — unauthenticated initialize", () => {
  it("completes initialize without Authorization header", async () => {
    const res = await send("POST", "/mcp", jsonRpc("initialize", 1, INITIALIZE_PARAMS));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result?: {
        serverInfo?: { name: string; version: string };
        capabilities?: { tools?: unknown };
        protocolVersion?: string;
      };
    };

    expect(json.jsonrpc).toBe("2.0");
    expect(json.id).toBe(1);
    expect(json.result?.serverInfo?.name).toBe("empower-financial");
    expect(json.result?.serverInfo?.version).toBe("1.0.0");
    expect(json.result?.protocolVersion).toBeDefined();
  });

  it("advertises tools capability", async () => {
    const res = await send("POST", "/mcp", jsonRpc("initialize", 1, INITIALIZE_PARAMS));
    const json = (await res.json()) as {
      result?: { capabilities?: { tools?: unknown } };
    };
    expect(json.result?.capabilities?.tools).toBeDefined();
  });

  it("works with an invalid/expired Authorization header (degrades gracefully)", async () => {
    const res = await send(
      "POST",
      "/mcp",
      jsonRpc("initialize", 1, INITIALIZE_PARAMS),
      { Authorization: "Bearer invalidtoken" },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: { serverInfo?: { name: string } };
    };
    expect(json.result?.serverInfo?.name).toBe("empower-financial");
  });
});

// ---------------------------------------------------------------------------
// MCP protocol — notifications/initialized
//
// After initialize, clients send a notification (no id field).
// The server MUST return 202 Accepted for notifications.
// ---------------------------------------------------------------------------
describe("MCP endpoint — notifications", () => {
  it("accepts notifications/initialized (no id, expects 202)", async () => {
    const res = await send("POST", "/mcp", {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    // The MCP SDK returns 202 for notifications (messages without an id)
    expect(res.status).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// Route handling
// ---------------------------------------------------------------------------
describe("Route handling", () => {
  it("serves auth page HTML on GET /", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("html");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/unknown", { method: "GET" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 405 for non-POST /auth requests", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/auth/login", { method: "GET" }),
    );
    expect(res.status).toBe(405);
  });
});
