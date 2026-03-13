import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession } from "../empower/types.js";

export function registerGetAccounts(server: McpServer, getSession: () => EmpowerSession) {
  server.tool(
    "get_accounts",
    "List all linked financial accounts including balances, account types, and institutions",
    {},
    async () => {
      try {
        const session = getSession();
        const client = new EmpowerClient(session);
        const response = await client.getAccounts();

        const accounts = response.spData?.accounts ?? [];

        if (accounts.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No accounts found." }],
          };
        }

        // Group accounts by type
        const grouped: Record<string, typeof accounts> = {};
        for (const acct of accounts) {
          if (!acct.isActive) continue;
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
            output += `- **${acct.accountName}** (${acct.firmName || "Unknown"}): ${balanceStr}`;
            if (acct.lastRefreshed) {
              output += ` — updated ${acct.lastRefreshed}`;
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
