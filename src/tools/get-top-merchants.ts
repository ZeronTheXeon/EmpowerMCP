import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession } from "../empower/types.js";
import { resolveSession } from "../session.js";

export function registerGetTopMerchants(server: McpServer, getSession: () => EmpowerSession | null) {
  server.tool(
    "get_top_merchants",
    "Get top merchants and spending categories ranked by total amount for a date range — helps answer 'where is my money going?'",
    {
      token: z.string().optional().describe("Empower session token (base64-encoded). If omitted, the Authorization header is used."),
      startDate: z.string().describe("Start date in YYYY-MM-DD format"),
      endDate: z.string().describe("End date in YYYY-MM-DD format"),
      limit: z.number().optional().describe("Number of top entries to show (default 20)"),
    },
    async ({ token, startDate, endDate, limit }) => {
      try {
        const session = resolveSession(token, getSession);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Not authenticated. Please provide a valid session token via the 'token' parameter or the Authorization header. Visit the root URL of this server to get your token." }], isError: true };
        }
        const client = new EmpowerClient(session);
        const response = await client.getTransactions(startDate, endDate);

        const spData = response.spData as Record<string, unknown>;
        const transactions = (spData?.transactions ?? []) as Array<Record<string, unknown>>;

        if (transactions.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No transactions found for ${startDate} to ${endDate}.` }],
          };
        }

        const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
        const maxItems = limit ?? 20;

        // Aggregate spending by merchant/description
        const merchantSpend: Record<string, { total: number; count: number }> = {};
        const categorySpend: Record<string, { total: number; count: number }> = {};
        let totalSpending = 0;
        let totalIncome = 0;

        for (const tx of transactions) {
          const amount = Math.abs(tx.amount as number ?? 0);
          const isSpending = tx.isSpending as boolean;
          const isIncome = tx.isIncome as boolean;

          if (isIncome || (!isSpending && (tx.amount as number ?? 0) > 0)) {
            totalIncome += amount;
            continue;
          }

          if (!isSpending) continue;

          totalSpending += amount;

          const merchant = String(tx.simpleDescription || tx.description || "Unknown").trim();
          if (!merchantSpend[merchant]) merchantSpend[merchant] = { total: 0, count: 0 };
          merchantSpend[merchant].total += amount;
          merchantSpend[merchant].count++;

          const category = String(tx.categoryName || `Category ${tx.categoryId}` || "Uncategorized");
          if (!categorySpend[category]) categorySpend[category] = { total: 0, count: 0 };
          categorySpend[category].total += amount;
          categorySpend[category].count++;
        }

        let output = `# Spending Analysis: ${startDate} to ${endDate}\n\n`;
        output += `**Total Spending:** ${fmt(totalSpending)} | **Total Income:** ${fmt(totalIncome)} | **Transactions:** ${transactions.length}\n\n`;

        // Top categories
        const topCategories = Object.entries(categorySpend)
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, maxItems);

        output += `## Top Categories\n\n`;
        output += `| Category | Amount | % of Spend | Txns |\n`;
        output += `|----------|--------|------------|------|\n`;
        for (const [name, data] of topCategories) {
          const pctOfTotal = totalSpending > 0 ? ((data.total / totalSpending) * 100).toFixed(1) : "0";
          output += `| ${name} | ${fmt(data.total)} | ${pctOfTotal}% | ${data.count} |\n`;
        }

        // Top merchants
        const topMerchants = Object.entries(merchantSpend)
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, maxItems);

        output += `\n## Top Merchants\n\n`;
        output += `| Merchant | Amount | % of Spend | Txns |\n`;
        output += `|----------|--------|------------|------|\n`;
        for (const [name, data] of topMerchants) {
          const pctOfTotal = totalSpending > 0 ? ((data.total / totalSpending) * 100).toFixed(1) : "0";
          output += `| ${name} | ${fmt(data.total)} | ${pctOfTotal}% | ${data.count} |\n`;
        }

        // Recurring detection: merchants with 2+ transactions
        const recurring = Object.entries(merchantSpend)
          .filter(([, data]) => data.count >= 2)
          .sort((a, b) => b[1].total - a[1].total);

        if (recurring.length > 0) {
          output += `\n## Likely Recurring (2+ transactions)\n\n`;
          output += `| Merchant | Total | Avg/Txn | Txns |\n`;
          output += `|----------|-------|---------|------|\n`;
          for (const [name, data] of recurring.slice(0, maxItems)) {
            output += `| ${name} | ${fmt(data.total)} | ${fmt(data.total / data.count)} | ${data.count} |\n`;
          }
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
