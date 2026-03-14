import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession } from "../empower/types.js";
import { resolveSession } from "../session.js";

export function registerGetNetWorth(server: McpServer, getSession: () => EmpowerSession | null) {
  server.tool(
    "get_networth",
    "Get net worth history over a date range, showing assets, liabilities, and net worth over time",
    {
      token: z.string().optional().describe("Empower session token (base64-encoded). If omitted, the Authorization header is used."),
      startDate: z.string().describe("Start date in YYYY-MM-DD format"),
      endDate: z.string().describe("End date in YYYY-MM-DD format"),
      interval: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional().describe("Data point interval, defaults to MONTHLY"),
    },
    async ({ token, startDate, endDate, interval }) => {
      try {
        const session = resolveSession(token, getSession);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Not authenticated. Please provide a valid session token via the 'token' parameter or the Authorization header. Visit the root URL of this server to get your token." }], isError: true };
        }
        const client = new EmpowerClient(session);
        const response = await client.getNetWorth(startDate, endDate, interval ?? "MONTHLY");

        const histories = response.spData?.histories ?? [];

        let output = `# Net Worth History: ${startDate} to ${endDate}\n\n`;
        output += `Interval: ${interval ?? "MONTHLY"}\n\n`;

        if (histories.length === 0) {
          output += "No net worth data found for this date range.\n";
          return { content: [{ type: "text" as const, text: output }] };
        }

        // Current snapshot (latest data point)
        const latest = histories[histories.length - 1];
        if (latest) {
          output += `## Current Snapshot\n\n`;
          output += `- **Assets:** ${(latest.assets ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
          output += `- **Liabilities:** ${(latest.liabilities ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}\n`;
          output += `- **Net Worth:** ${(latest.networth ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}\n\n`;
        }

        // Historical series
        output += `## Historical Data (${histories.length} data points)\n\n`;
        output += `| Date | Assets | Liabilities | Net Worth |\n`;
        output += `|------|--------|-------------|----------|\n`;

        for (const point of histories) {
          const assets = (point.assets ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
          const liabilities = (point.liabilities ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
          const nw = (point.networth ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
          output += `| ${point.date} | ${assets} | ${liabilities} | ${nw} |\n`;
        }

        // Change summary
        if (histories.length >= 2) {
          const first = histories[0];
          const last = histories[histories.length - 1];
          const change = (last.networth ?? 0) - (first.networth ?? 0);
          const changePercent = first.networth ? ((change / Math.abs(first.networth)) * 100).toFixed(2) : "N/A";
          output += `\n---\n`;
          output += `**Change:** ${change.toLocaleString("en-US", { style: "currency", currency: "USD" })} (${changePercent}%)\n`;
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
