import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmpowerClient, SessionExpiredError, EmpowerApiError } from "../empower/client.js";
import type { EmpowerSession } from "../empower/types.js";
import { resolveSession } from "../session.js";

export function registerGetSpending(server: McpServer, getSession: () => EmpowerSession | null) {
  server.tool(
    "get_spending",
    "Get spending summary with weekly, monthly, and yearly averages, current totals, and budget targets",
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
        const response = await client.getUserSpending(startDate, endDate);

        const intervals = (response.spData as Record<string, unknown>)?.intervals as Array<Record<string, unknown>> ?? [];

        if (intervals.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No spending data found for ${startDate} to ${endDate}.` }],
          };
        }

        let output = `# Spending Summary: ${startDate} to ${endDate}\n\n`;

        for (const interval of intervals) {
          const type = String(interval.type || "UNKNOWN");
          const average = interval.average as number ?? 0;
          const current = interval.current as number ?? 0;
          const target = interval.target as number | undefined;
          const details = interval.details as Array<Record<string, unknown>> ?? [];

          const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

          output += `## ${type}\n\n`;
          output += `- **Current Spending:** ${fmt(current)}\n`;
          output += `- **Average Spending:** ${fmt(average)}\n`;
          if (target !== undefined && target !== null) {
            output += `- **Budget Target:** ${fmt(target)}\n`;
            const remaining = target - current;
            output += `- **Remaining:** ${fmt(remaining)}`;
            if (remaining < 0) {
              output += ` (over budget by ${fmt(Math.abs(remaining))})`;
            }
            output += "\n";
            const pctUsed = target > 0 ? ((current / target) * 100).toFixed(1) : "N/A";
            output += `- **% Used:** ${pctUsed}%\n`;
          }

          // Show daily spending if available and not too many
          if (details.length > 0 && details.length <= 31) {
            const nonZeroDays = details.filter(d => (d.amount as number) !== 0);
            if (nonZeroDays.length > 0) {
              output += `\n| Date | Amount |\n|------|--------|\n`;
              for (const day of nonZeroDays) {
                output += `| ${day.date} | ${fmt(day.amount as number)} |\n`;
              }
            }
          }

          output += "\n";
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
