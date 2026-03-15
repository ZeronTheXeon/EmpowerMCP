/**
 * Empower (Personal Capital) API wrapper.
 *
 * API endpoints and request parameters derived from:
 * - https://github.com/haochi/personalcapital (MIT License)
 * - https://github.com/ChocoTonic/personalcapital-py (MIT License)
 * - https://github.com/PaulNorton/personal-capital-connector-mcp
 *
 * See THIRD-PARTY-NOTICES.md for full license texts.
 */

import type {
  EmpowerSession,
  AccountsResponse,
  TransactionsResponse,
  NetWorthResponse,
  HoldingsResponse,
  EmpowerApiResponse,
  SiteConfig,
} from "./types.js";
import { sessionToHeaders } from "../session.js";
import { EMPOWER_SITES, EMPOWER_SITE_URLS, getSiteConfig } from "./types.js";

export class SessionExpiredError extends Error {
  constructor(message = "Your Empower session has expired. Please re-authenticate to get a new token.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export class EmpowerApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmpowerApiError";
  }
}

export class EmpowerClient {
  private session: EmpowerSession;
  private headers: Record<string, string>;
  private apiBase: string;
  private siteConfig: SiteConfig;

  constructor(session: EmpowerSession) {
    this.session = session;
    this.headers = sessionToHeaders(session);
    const baseUrl = session.baseUrl || EMPOWER_SITES.CLASSIC;
    if (!EMPOWER_SITE_URLS.has(baseUrl as never)) {
      throw new Error(`Invalid base URL in session: ${baseUrl}`);
    }
    this.apiBase = `${baseUrl}/api`;
    this.siteConfig = getSiteConfig(baseUrl);
  }

  /**
   * Resolve an endpoint path, applying any site-specific overrides.
   */
  private resolveEndpoint(endpoint: string): string {
    return this.siteConfig.endpointOverrides[endpoint] ?? endpoint;
  }

  /**
   * Make an authenticated POST request to the Empower API.
   * Uses multipart/form-data for the new Empower site, URL-encoded for classic.
   */
  private async apiPost(endpoint: string, params: Record<string, string> = {}): Promise<EmpowerApiResponse> {
    const resolvedEndpoint = this.resolveEndpoint(endpoint);
    const headers = { ...this.headers };

    let body: FormData | string;
    if (this.siteConfig.useMultipartFormData) {
      const formData = new FormData();
      formData.append("csrf", this.session.csrf);
      formData.append("apiClient", "WEB");
      formData.append("lastServerChangeId", "-1");
      for (const [k, v] of Object.entries(params)) {
        formData.append(k, v);
      }
      body = formData;
      // Do NOT set Content-Type — fetch auto-sets it with the multipart boundary
    } else {
      body = new URLSearchParams({
        ...params,
        lastServerChangeId: "-1",
        csrf: this.session.csrf,
        apiClient: "WEB",
      }).toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const url = `${this.apiBase}${resolvedEndpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
    });

    if (response.status === 403 || response.status === 401) {
      throw new SessionExpiredError();
    }

    if (!response.ok && response.status !== 200) {
      throw new EmpowerApiError(`Empower API returned HTTP ${response.status}`);
    }

    const data = await response.json() as EmpowerApiResponse;

    if (!data.spHeader?.success) {
      const errors = data.spHeader?.errors;
      if (errors?.some(e => e.code === 201 || e.code === 202)) {
        throw new SessionExpiredError();
      }
      const errorMsg = errors?.map(e => e.message).join("; ") || "Unknown Empower API error";
      throw new EmpowerApiError(errorMsg);
    }

    return data;
  }

  /**
   * Get all linked financial accounts.
   * Endpoint: /newaccount/getAccounts
   */
  async getAccounts(): Promise<AccountsResponse> {
    const response = await this.apiPost("/newaccount/getAccounts");
    return response as unknown as AccountsResponse;
  }

  /**
   * Get user transactions for a date range.
   * Endpoint: /transaction/getUserTransactions
   */
  async getTransactions(startDate: string, endDate: string): Promise<TransactionsResponse> {
    const response = await this.apiPost("/transaction/getUserTransactions", {
      startDate,
      endDate,
      sort_cols: "transactionTime",
      sort_rev: "true",
      page: "0",
      rows_per_page: "500",
      component: "DATAGRID",
    });
    return response as unknown as TransactionsResponse;
  }

  /**
   * Get net worth history over a date range.
   * Endpoint: /newaccount/getHistories
   */
  async getNetWorth(startDate: string, endDate: string, interval: string = "MONTHLY"): Promise<NetWorthResponse> {
    const response = await this.apiPost("/newaccount/getHistories", {
      startDate,
      endDate,
      intervalType: interval,
    });
    return response as unknown as NetWorthResponse;
  }

  /**
   * Get cash flow (income vs spending) for a date range.
   * Uses the transactions endpoint and aggregates by category.
   */
  async getCashFlow(startDate: string, endDate: string): Promise<TransactionsResponse> {
    const response = await this.apiPost("/transaction/getUserTransactions", {
      startDate,
      endDate,
    });
    return response as unknown as TransactionsResponse;
  }

  /**
   * Get investment holdings.
   * Endpoint: /invest/getHoldings
   */
  async getHoldings(): Promise<HoldingsResponse> {
    const response = await this.apiPost("/invest/getHoldings");
    return response as unknown as HoldingsResponse;
  }

  /**
   * Get spending summary with weekly/monthly/yearly intervals and budget targets.
   * Endpoint: /account/getUserSpending
   */
  async getUserSpending(startDate: string, endDate: string): Promise<EmpowerApiResponse> {
    return this.apiPost("/account/getUserSpending", {
      startDate,
      endDate,
      intervalType: "MONTH",
    });
  }

  /**
   * Get per-account performance summaries (income, expenses, balance changes).
   * Endpoint: /account/getHistories with types=["accountSummaries"]
   */
  async getAccountPerformance(startDate: string, endDate: string): Promise<EmpowerApiResponse> {
    return this.apiPost("/account/getHistories", {
      startDate,
      endDate,
      interval: "MONTH",
      types: JSON.stringify(["accountSummaries"]),
    });
  }
}
