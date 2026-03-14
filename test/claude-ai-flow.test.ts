import { describe, it, expect } from "vitest";
import worker from "../src/index.js";

/**
 * Simulate exactly what Claude.ai's MCP connector does:
 *   1. POST /mcp  initialize  (expects 200 + serverInfo)
 *   2. POST /mcp  notifications/initialized  (expects 202)
 *   3. POST /mcp  tools/list  (expects 200 + tools array)
 *   4. POST /mcp  tools/call  (expects 200 + result)
 *
 * Each POST is a completely independent HTTP request (no cookies, no
 * persistent connection). The server creates a new McpServer + transport
 * per request (stateless mode).
 */

function post(body: unknown, headers?: Record<string, string>): Promise<Response> {
  return worker.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("Claude.ai connector full flow simulation", () => {
  it("Step 1: initialize succeeds", async () => {
    const res = await post({
      jsonrpc: "2.0",
      method: "initialize",
      id: 1,
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "claude-ai", version: "1.0.0" },
      },
    });

    console.log("initialize status:", res.status);
    console.log("initialize headers:", Object.fromEntries(res.headers.entries()));
    const json = await res.json();
    console.log("initialize body:", JSON.stringify(json, null, 2));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("Step 2: notifications/initialized returns 202", async () => {
    const res = await post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    console.log("notifications/initialized status:", res.status);
    const text = await res.text();
    console.log("notifications/initialized body:", text);

    expect(res.status).toBe(202);
  });

  it("Step 3: tools/list on a fresh stateless connection", async () => {
    const res = await post({
      jsonrpc: "2.0",
      method: "tools/list",
      id: 2,
      params: {},
    });

    console.log("tools/list status:", res.status);
    const text = await res.text();
    console.log("tools/list body:", text);

    // This is the critical test — does a fresh server handle tools/list
    // without a prior initialize in the same request cycle?
    expect(res.status).toBe(200);
  });

  it("Step 3b: tools/list with MCP-Protocol-Version header", async () => {
    const res = await post(
      {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 3,
        params: {},
      },
      { "MCP-Protocol-Version": "2025-03-26" },
    );

    console.log("tools/list (with protocol version) status:", res.status);
    const text = await res.text();
    console.log("tools/list (with protocol version) body:", text);

    expect(res.status).toBe(200);
  });

  it("Full sequence: initialize → notif → tools/list → tools/call", async () => {
    // 1. initialize
    const initRes = await post({
      jsonrpc: "2.0",
      method: "initialize",
      id: 1,
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "claude-ai", version: "1.0.0" },
      },
    });
    expect(initRes.status).toBe(200);

    // 2. notifications/initialized
    const notifRes = await post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(notifRes.status).toBe(202);

    // 3. tools/list
    const listRes = await post({
      jsonrpc: "2.0",
      method: "tools/list",
      id: 2,
      params: {},
    });
    console.log("tools/list in full flow — status:", listRes.status);
    const listJson = await listRes.json();
    console.log("tools/list in full flow — body:", JSON.stringify(listJson, null, 2));
    expect(listRes.status).toBe(200);

    // 4. tools/call (without auth — should get auth error from tool)
    const callRes = await post({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 3,
      params: { name: "get_accounts", arguments: {} },
    });
    console.log("tools/call in full flow — status:", callRes.status);
    const callJson = await callRes.json();
    console.log("tools/call in full flow — body:", JSON.stringify(callJson, null, 2));
    expect(callRes.status).toBe(200);
  });
});
