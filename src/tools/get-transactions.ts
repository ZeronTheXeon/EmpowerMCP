import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession, Transaction } from "../empower/types.js";

export function registerGetTransactions(server: McpServer, getSession: () => EmpowerSession) {
  server.tool(
    "get_transactions",
    "Get transactions for a date range, optionally filtered by account or category",
    {
      startDate: z.string().describe("Start date in YYYY-MM-DD format"),
      endDate: z.string().describe("End date in YYYY-MM-DD format"),
      accountId: z.string().optional().describe("Filter to a specific account ID"),
      category: z.string().optional().describe("Filter by transaction category name"),
    },
    async ({ startDate, endDate, accountId, category }) => {
      try {
        const session = getSession();
        const client = new EmpowerClient(session);
        const response = await client.getTransactions(startDate, endDate);

        let transactions: Transaction[] = response.spData?.transactions ?? [];

        // Apply filters
        if (accountId) {
          transactions = transactions.filter(t => String(t.accountId) === accountId);
        }
        if (category) {
          const lowerCategory = category.toLowerCase();
          transactions = transactions.filter(t =>
            t.categoryName?.toLowerCase().includes(lowerCategory)
          );
        }

        if (transactions.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No transactions found for ${startDate} to ${endDate}.` }],
          };
        }

        // Sort by date descending
        transactions.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));

        let output = `# Transactions: ${startDate} to ${endDate}\n\n`;
        output += `Found ${transactions.length} transaction(s).\n\n`;

        let totalIncome = 0;
        let totalSpending = 0;

        for (const tx of transactions) {
          const amount = tx.amount ?? 0;
          const amountStr = Math.abs(amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
          const sign = amount >= 0 ? "+" : "-";
          const pending = tx.isPending ? " (pending)" : "";
          const cat = tx.categoryName ? ` [${tx.categoryName}]` : "";
          const acctName = tx.accountName ? ` — ${tx.accountName}` : "";

          output += `- **${tx.transactionDate}** ${sign}${amountStr} — ${tx.simpleDescription || tx.description}${cat}${acctName}${pending}\n`;

          if (tx.isIncome || amount > 0) {
            totalIncome += Math.abs(amount);
          } else if (tx.isSpending || amount < 0) {
            totalSpending += Math.abs(amount);
          }
        }

        output += `\n---\n`;
        output += `**Total Income:** ${totalIncome.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
        output += `**Total Spending:** ${totalSpending.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
        output += `**Net:** ${(totalIncome - totalSpending).toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;

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
