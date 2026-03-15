import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession } from "../empower/types.js";
import { resolveSession } from "../session.js";

export function registerGetAccounts(server: McpServer, getSession: () => EmpowerSession | null) {
  server.tool(
    "get_accounts",
    "List all linked financial accounts including balances, account types, and institutions",
    {
      token: z.string().optional().describe("Empower session token (base64-encoded). If omitted, the Authorization header is used."),
    },
    async ({ token }) => {
      try {
        const session = resolveSession(token, getSession);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Not authenticated. Please provide a valid session token via the 'token' parameter or the Authorization header. Visit the root URL of this server to get your token." }], isError: true };
        }
        const client = new EmpowerClient(session);
        const response = await client.getAccounts();

        const accounts = response.spData?.accounts ?? [];

        if (accounts.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No accounts found." }],
          };
        }

        // Group accounts by type, filtering out closed accounts.
        // The new Empower API uses closedDate (empty string = active) instead of isActive.
        const grouped: Record<string, typeof accounts> = {};
        for (const acct of accounts) {
          const isClosed = acct.closedDate && acct.closedDate !== "";
          const isActive = "isActive" in acct ? acct.isActive : !isClosed;
          if (!isActive) continue;
          const group = acct.accountTypeGroup || acct.accountType || "Other";
          if (!grouped[group]) grouped[group] = [];
          grouped[group].push(acct);
        }

        let output = "# Financial Accounts\n\n";
        let totalAssets = 0;
        let totalLiabilities = 0;

        for (const [group, accts] of Object.entries(grouped)) {
          output += `## ${group}\n\n`;
          for (const acct of accts) {
            const balance = acct.balance ?? 0;
            const balanceStr = balance.toLocaleString("en-US", { style: "currency", currency: "USD" });
            // New Empower API uses `name` instead of `accountName`
            const displayName = acct.accountName || acct.name || acct.originalName || "Unknown";
            output += `- **${displayName}** (${acct.firmName || "Unknown"}): ${balanceStr}`;
            if (acct.lastRefreshed) {
              const refreshDate = typeof acct.lastRefreshed === "number"
                ? new Date(acct.lastRefreshed).toLocaleDateString()
                : acct.lastRefreshed;
              output += ` — updated ${refreshDate}`;
            }
            output += "\n";

            if (acct.isAsset) {
              totalAssets += Math.abs(balance);
            } else {
              totalLiabilities += Math.abs(balance);
            }
          }
          output += "\n";
        }

        const netWorth = totalAssets - totalLiabilities;
        output += `---\n`;
        output += `**Total Assets:** ${totalAssets.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
        output += `**Total Liabilities:** ${totalLiabilities.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
        output += `**Net Worth:** ${netWorth.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          return { content: [{ type: "text" as const, text: error.message }], isError: true };
        }
        if (error instanceof EmpowerApiError) {
          return { content: [{ type: "text" as const, text: `Empower API error: ${error.message}. Try re-authenticating.` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: `Unexpected error: ${(error as Error).message}` }], isError: true };
      }
    }
  );
}
