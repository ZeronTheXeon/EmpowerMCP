import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession, Transaction } from "../empower/types.js";

export function registerGetCashFlow(server: McpServer, getSession: () => EmpowerSession) {
  server.tool(
    "get_cashflow",
    "Get income vs spending breakdown by category for a date range",
    {
      startDate: z.string().describe("Start date in YYYY-MM-DD format"),
      endDate: z.string().describe("End date in YYYY-MM-DD format"),
    },
    async ({ startDate, endDate }) => {
      try {
        const session = getSession();
        const client = new EmpowerClient(session);
        const response = await client.getCashFlow(startDate, endDate);

        const transactions: Transaction[] = response.spData?.transactions ?? [];

        if (transactions.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No transactions found for ${startDate} to ${endDate}.` }],
          };
        }

        // Aggregate by category
        const incomeByCategory: Record<string, number> = {};
        const expenseByCategory: Record<string, number> = {};
        let totalIncome = 0;
        let totalExpense = 0;

        for (const tx of transactions) {
          const amount = Math.abs(tx.amount ?? 0);
          const category = tx.categoryName || "Uncategorized";

          if (tx.isIncome || (tx.amount ?? 0) > 0) {
            totalIncome += amount;
            incomeByCategory[category] = (incomeByCategory[category] || 0) + amount;
          } else if (tx.isSpending || (tx.amount ?? 0) < 0) {
            totalExpense += amount;
            expenseByCategory[category] = (expenseByCategory[category] || 0) + amount;
          }
        }

        let output = `# Cash Flow: ${startDate} to ${endDate}\n\n`;
        output += `## Summary\n\n`;
        output += `- **Total Income:** ${totalIncome.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
        output += `- **Total Expenses:** ${totalExpense.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
        output += `- **Net Cash Flow:** ${(totalIncome - totalExpense).toLocaleString("en-US", { style: "currency", currency: "USD" })}\n\n`;

        // Income breakdown
        const incomeEntries = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]);
        if (incomeEntries.length > 0) {
          output += `## Income by Category\n\n`;
          for (const [cat, amount] of incomeEntries) {
            const pct = totalIncome > 0 ? ((amount / totalIncome) * 100).toFixed(1) : "0";
            output += `- **${cat}:** ${amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} (${pct}%)\n`;
          }
          output += "\n";
        }

        // Expense breakdown (sorted by amount descending)
        const expenseEntries = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);
        if (expenseEntries.length > 0) {
          output += `## Expenses by Category\n\n`;
          for (const [cat, amount] of expenseEntries) {
            const pct = totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : "0";
            output += `- **${cat}:** ${amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} (${pct}%)\n`;
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
