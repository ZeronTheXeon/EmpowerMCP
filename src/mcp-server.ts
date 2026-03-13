import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EmpowerSession } from "./empower/types.js";
import { registerGetAccounts } from "./tools/get-accounts.js";
import { registerGetTransactions } from "./tools/get-transactions.js";
import { registerGetNetWorth } from "./tools/get-networth.js";
import { registerGetCashFlow } from "./tools/get-cashflow.js";
import { registerGetHoldings } from "./tools/get-holdings.js";

/**
 * Create and configure the MCP server with all 5 financial tools.
 * The session getter is called lazily by each tool when it handles a request.
 */
export function createMcpServer(getSession: () => EmpowerSession | null): McpServer {
  const server = new McpServer({
    name: "empower-financial",
    version: "1.0.0",
  });

  registerGetAccounts(server, getSession);
  registerGetTransactions(server, getSession);
  registerGetNetWorth(server, getSession);
  registerGetCashFlow(server, getSession);
  registerGetHoldings(server, getSession);

  return server;
}
