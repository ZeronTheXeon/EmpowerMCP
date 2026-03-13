import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession, Holding } from "../empower/types.js";

export function registerGetHoldings(server: McpServer, getSession: () => EmpowerSession) {
  server.tool(
    "get_holdings",
    "Get investment holdings breakdown including tickers, shares, values, and allocation percentages",
    {
      accountId: z.string().optional().describe("Filter to a specific investment account ID"),
    },
    async ({ accountId }) => {
      try {
        const session = getSession();
        const client = new EmpowerClient(session);
        const response = await client.getHoldings();

        let holdings: Holding[] = response.spData?.holdings ?? [];

        if (accountId) {
          holdings = holdings.filter(h => String(h.accountId) === accountId);
        }

        if (holdings.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No investment holdings found." }],
          };
        }

        // Sort by value descending
        holdings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

        const totalValue = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0);

        let output = `# Investment Holdings\n\n`;
        output += `**Total Portfolio Value:** ${totalValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n\n`;

        // Group by account
        const byAccount: Record<string, Holding[]> = {};
        for (const h of holdings) {
          const acctKey = h.accountName || h.accountId || "Unknown Account";
          if (!byAccount[acctKey]) byAccount[acctKey] = [];
          byAccount[acctKey].push(h);
        }

        for (const [acctName, acctHoldings] of Object.entries(byAccount)) {
          const acctTotal = acctHoldings.reduce((sum, h) => sum + (h.value ?? 0), 0);
          output += `## ${acctName} (${acctTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })})\n\n`;
          output += `| Holding | Ticker | Shares | Price | Value | % of Portfolio |\n`;
          output += `|---------|--------|--------|-------|-------|---------------|\n`;

          for (const h of acctHoldings) {
            const ticker = h.ticker || "—";
            const shares = h.quantity?.toFixed(4) ?? "—";
            const price = h.price != null ? h.price.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";
            const value = (h.value ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
            const pctPortfolio = totalValue > 0 ? (((h.value ?? 0) / totalValue) * 100).toFixed(2) : "0";
            const name = h.description || ticker;

            output += `| ${name} | ${ticker} | ${shares} | ${price} | ${value} | ${pctPortfolio}% |\n`;
          }
          output += "\n";
        }

        // Cost basis summary if available
        const withCostBasis = holdings.filter(h => h.costBasis != null);
        if (withCostBasis.length > 0) {
          const totalCost = withCostBasis.reduce((sum, h) => sum + (h.costBasis ?? 0), 0);
          const totalGain = withCostBasis.reduce((sum, h) => sum + (h.value ?? 0), 0) - totalCost;
          output += `---\n`;
          output += `**Total Cost Basis:** ${totalCost.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
          output += `**Unrealized Gain/Loss:** ${totalGain.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
        }

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
