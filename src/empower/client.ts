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
} from "./types.js";
import { sessionToHeaders } from "../session.js";
import { EMPOWER_SITES } from "./types.js";

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

  constructor(session: EmpowerSession) {
    this.session = session;
    this.headers = sessionToHeaders(session);
    const baseUrl = session.baseUrl || EMPOWER_SITES.CLASSIC;
    this.apiBase = `${baseUrl}/api`;
  }

  /**
   * Make an authenticated POST request to the Empower API.
   * All Empower data endpoints use POST with form-encoded body.
   */
  private async apiPost(endpoint: string, params: Record<string, string> = {}): Promise<EmpowerApiResponse> {
    const body = new URLSearchParams({
      ...params,
      lastServerChangeId: "-1",
      csrf: this.session.csrf,
      apiClient: "WEB",
    });

    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: "POST",
      headers: this.headers,
      body: body.toString(),
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
}
