import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession } from "../empower/types.js";
import { resolveSession } from "../session.js";

export function registerGetInvestmentAllocation(server: McpServer, getSession: () => EmpowerSession | null) {
  server.tool(
    "get_investment_allocation",
    "Get detailed investment portfolio breakdown with holdings, gains/losses, fees, daily changes, and allocation percentages",
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
        const response = await client.getHoldings();

        const spData = response.spData as Record<string, unknown>;
        const holdings = (spData?.holdings ?? []) as Array<Record<string, unknown>>;
        const totalValue = spData?.holdingsTotalValue as number ?? 0;

        if (holdings.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No investment holdings found." }],
          };
        }

        const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
        const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

        // Group holdings by account, filtering out zero-value entries
        const byAccount: Record<string, Array<Record<string, unknown>>> = {};
        for (const h of holdings) {
          if ((h.value as number ?? 0) === 0) continue;
          const acct = String(h.accountName || "Unknown Account");
          if (!byAccount[acct]) byAccount[acct] = [];
          byAccount[acct].push(h);
        }

        let output = `# Investment Portfolio\n\n`;
        output += `**Total Portfolio Value:** ${fmt(totalValue)}\n\n`;

        for (const [acctName, acctHoldings] of Object.entries(byAccount)) {
          const acctTotal = acctHoldings.reduce((s, h) => s + (h.value as number ?? 0), 0);
          output += `## ${acctName} (${fmt(acctTotal)})\n\n`;
          output += `| Holding | Ticker | Shares | Price | Value | Alloc % | Day Change | Gain/Loss | Fees/yr |\n`;
          output += `|---------|--------|--------|-------|-------|---------|------------|-----------|--------|\n`;

          const sorted = acctHoldings.sort((a, b) => (b.value as number ?? 0) - (a.value as number ?? 0));
          for (const h of sorted) {
            const desc = String(h.description || h.originalDescription || "").substring(0, 30);
            const ticker = String(h.ticker || "-");
            const qty = (h.quantity as number ?? 0).toFixed(2);
            const price = fmt(h.price as number ?? 0);
            const value = fmt(h.value as number ?? 0);
            const alloc = ((h.holdingPercentage as number ?? 0)).toFixed(1);
            const dayChange = h.oneDayPercentChange !== undefined
              ? pct(h.oneDayPercentChange as number)
              : "-";
            const costBasis = h.costBasis as number | undefined;
            const gainLoss = costBasis !== undefined && costBasis > 0
              ? fmt((h.value as number ?? 0) - costBasis)
              : "-";
            const fees = h.feesPerYear as number | undefined;
            const feesStr = fees !== undefined ? fmt(fees) : "-";

            output += `| ${desc} | ${ticker} | ${qty} | ${price} | ${value} | ${alloc}% | ${dayChange} | ${gainLoss} | ${feesStr} |\n`;
          }
          output += "\n";
        }

        // Summary stats
        const totalFees = holdings.reduce((s, h) => s + (h.feesPerYear as number ?? 0), 0);
        const totalCostBasis = holdings.reduce((s, h) => s + (h.costBasis as number ?? 0), 0);
        const totalGainLoss = totalValue - totalCostBasis;
        const totalDayChange = holdings.reduce((s, h) => s + (h.oneDayValueChange as number ?? 0), 0);

        output += `---\n`;
        output += `**Total Gain/Loss:** ${fmt(totalGainLoss)} (${totalCostBasis > 0 ? pct((totalGainLoss / totalCostBasis) * 100) : "N/A"})\n`;
        output += `**Today's Change:** ${fmt(totalDayChange)}\n`;
        output += `**Total Annual Fees:** ${fmt(totalFees)} (${totalValue > 0 ? ((totalFees / totalValue) * 100).toFixed(3) : "0"}% of portfolio)\n`;

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
