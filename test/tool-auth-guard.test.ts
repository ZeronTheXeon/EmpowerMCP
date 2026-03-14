import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerGetAccounts } from "../src/tools/get-accounts.js";
import { registerGetTransactions } from "../src/tools/get-transactions.js";
import { registerGetNetWorth } from "../src/tools/get-networth.js";
import { registerGetCashFlow } from "../src/tools/get-cashflow.js";
import { registerGetHoldings } from "../src/tools/get-holdings.js";

type ToolResult = {
  result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
  error?: unknown;
};

/**
 * Create an MCP server with all tools registered, initialize it via a
 * sessionful transport (so we can reuse it), then call the specified tool.
 */
async function callToolWithoutAuth(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const nullSession = () => null;
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerGetAccounts(server, nullSession);
  registerGetTransactions(server, nullSession);
  registerGetNetWorth(server, nullSession);
  registerGetCashFlow(server, nullSession);
  registerGetHoldings(server, nullSession);

  // Use a sessionful transport so we can send initialize + tools/call
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => "test-session",
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const post = (body: unknown, extraHeaders?: Record<string, string>) =>
    transport.handleRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      }),
    );

  // Initialize
  const initRes = await post({
    jsonrpc: "2.0", method: "initialize", id: 1,
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
  });
  expect(initRes.status).toBe(200);

  // Call the tool
  const toolRes = await post(
    {
      jsonrpc: "2.0", method: "tools/call", id: 2,
      params: { name: toolName, arguments: args },
    },
    { "mcp-session-id": "test-session" },
  );

  await transport.close();
  await server.close();

  return (await toolRes.json()) as ToolResult;
}

// ---------------------------------------------------------------------------
// All 5 tools must return a helpful auth error when called without a session.
// This ensures Claude Code / Claude.ai users see a clear message instead of
// a cryptic crash when they haven't provided a session token.
// ---------------------------------------------------------------------------
describe("Tool auth guards — unauthenticated calls return helpful error", () => {
  it("get_accounts", async () => {
    const res = await callToolWithoutAuth("get_accounts", {});
    expect(res.result?.isError).toBe(true);
    expect(res.result?.content?.[0]?.text).toContain("Not authenticated");
  });

  it("get_transactions", async () => {
    const res = await callToolWithoutAuth("get_transactions", {
      startDate: "2025-01-01", endDate: "2025-01-31",
    });
    expect(res.result?.isError).toBe(true);
    expect(res.result?.content?.[0]?.text).toContain("Not authenticated");
  });

  it("get_networth", async () => {
    const res = await callToolWithoutAuth("get_networth", {
      startDate: "2025-01-01", endDate: "2025-01-31",
    });
    expect(res.result?.isError).toBe(true);
    expect(res.result?.content?.[0]?.text).toContain("Not authenticated");
  });

  it("get_cashflow", async () => {
    const res = await callToolWithoutAuth("get_cashflow", {
      startDate: "2025-01-01", endDate: "2025-01-31",
    });
    expect(res.result?.isError).toBe(true);
    expect(res.result?.content?.[0]?.text).toContain("Not authenticated");
  });

  it("get_holdings", async () => {
    const res = await callToolWithoutAuth("get_holdings", {});
    expect(res.result?.isError).toBe(true);
    expect(res.result?.content?.[0]?.text).toContain("Not authenticated");
  });
});
