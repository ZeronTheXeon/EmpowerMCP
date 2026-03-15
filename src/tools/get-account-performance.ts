import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession } from "../empower/types.js";
import { resolveSession } from "../session.js";

export function registerGetAccountPerformance(server: McpServer, getSession: () => EmpowerSession | null) {
  server.tool(
    "get_account_performance",
    "Get per-account performance summaries including income, expenses, cash flow, and balance changes over a date range",
    {
      token: z.string().optional().describe("Empower session token (base64-encoded). If omitted, the Authorization header is used."),
      startDate: z.string().describe("Start date in YYYY-MM-DD format"),
      endDate: z.string().describe("End date in YYYY-MM-DD format"),
    },
    async ({ token, startDate, endDate }) => {
      try {
        const session = resolveSession(token, getSession);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Not authenticated. Please provide a valid session token via the 'token' parameter or the Authorization header. Visit the root URL of this server to get your token." }], isError: true };
        }
        const client = new EmpowerClient(session);
        const response = await client.getAccountPerformance(startDate, endDate);

        const spData = response.spData as Record<string, unknown> ?? {};
        const summaries = spData.accountSummaries as Array<Record<string, unknown>> ?? [];

        if (summaries.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No account performance data found for ${startDate} to ${endDate}.` }],
          };
        }

        const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
        const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

        // Filter to accounts with meaningful data and sort by balance
        const active = summaries
          .filter(s => !s.closedDate && (s.currentBalance as number) !== 0)
          .sort((a, b) => Math.abs(b.currentBalance as number) - Math.abs(a.currentBalance as number));

        let output = `# Account Performance: ${startDate} to ${endDate}\n\n`;
        output += `| Account | Site | Balance | Change | Change % | Income | Expenses |\n`;
        output += `|---------|------|---------|--------|----------|--------|----------|\n`;

        for (const s of active) {
          const name = String(s.accountName || "Unknown");
          const site = String(s.siteName || "");
          const balance = s.currentBalance as number ?? 0;
          const balChange = s.dateRangeBalanceValueChange as number ?? 0;
          const balChangePct = s.dateRangeBalancePercentageChange as number ?? 0;
          const income = s.income as number ?? 0;
          const expense = s.expense as number ?? 0;

          output += `| ${name} | ${site} | ${fmt(balance)} | ${fmt(balChange)} | ${pct(balChangePct)} | ${fmt(income)} | ${fmt(expense)} |\n`;
        }

        // Summary totals
        const totalBalance = active.reduce((sum, s) => sum + (s.currentBalance as number ?? 0), 0);
        const totalChange = active.reduce((sum, s) => sum + (s.dateRangeBalanceValueChange as number ?? 0), 0);
        const totalIncome = active.reduce((sum, s) => sum + (s.income as number ?? 0), 0);
        const totalExpense = active.reduce((sum, s) => sum + (s.expense as number ?? 0), 0);

        output += `\n---\n`;
        output += `**Total Balance:** ${fmt(totalBalance)}\n`;
        output += `**Total Change:** ${fmt(totalChange)}\n`;
        output += `**Total Income:** ${fmt(totalIncome)}\n`;
        output += `**Total Expenses:** ${fmt(totalExpense)}\n`;
        output += `**Net Cash Flow:** ${fmt(totalIncome - totalExpense)}\n`;

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
