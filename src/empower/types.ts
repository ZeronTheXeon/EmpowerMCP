/**
 * TypeScript types for Empower (Personal Capital) API responses.
 *
 * Response structures based on:
 * - https://github.com/haochi/personalcapital (MIT License)
 * - https://github.com/ChocoTonic/personalcapital-py (MIT License)
 * - https://github.com/PaulNorton/personal-capital-connector-mcp
 *
 * See THIRD-PARTY-NOTICES.md for full license texts.
 */

export interface EmpowerSession {
  csrf: string;
  authLevel: string;
  cookies: Record<string, string>;
  baseUrl: string;
  siteKey?: EmpowerSiteKey;
  userGuid?: string;
  expiresAt?: number;
}

/** Known Empower site base URLs */
export const EMPOWER_SITES = {
  /** Original Personal Capital site (non-migrated users) */
  CLASSIC: "https://home.personalcapital.com",
  /** New Empower site (migrated users) */
  EMPOWER: "https://pc-api.empower-retirement.com",
} as const;

export type EmpowerSiteKey = keyof typeof EMPOWER_SITES;

/** All valid Empower site base URLs (for runtime validation). */
export const EMPOWER_SITE_URLS = new Set(Object.values(EMPOWER_SITES));

/** Per-site configuration for auth and API differences. */
export interface SiteConfig {
  baseUrl: string;
  /** Origin/Referer URL (differs from baseUrl on new Empower site) */
  participantUrl: string;
  /** Whether API calls use multipart/form-data instead of URL-encoded */
  useMultipartFormData: boolean;
  /** Endpoint path overrides (classic path → new path) */
  endpointOverrides: Record<string, string>;
}

export const SITE_CONFIGS: Record<string, SiteConfig> = {
  [EMPOWER_SITES.CLASSIC]: {
    baseUrl: EMPOWER_SITES.CLASSIC,
    participantUrl: EMPOWER_SITES.CLASSIC,
    useMultipartFormData: false,
    endpointOverrides: {},
  },
  [EMPOWER_SITES.EMPOWER]: {
    baseUrl: EMPOWER_SITES.EMPOWER,
    participantUrl: "https://participant.empower-retirement.com",
    useMultipartFormData: true,
    endpointOverrides: {},
  },
};

export function getSiteConfig(baseUrl: string): SiteConfig {
  return SITE_CONFIGS[baseUrl] ?? SITE_CONFIGS[EMPOWER_SITES.CLASSIC];
}

/** Resolve a site key to its base URL. Returns CLASSIC for unknown keys. */
export function resolveBaseUrl(siteKeyOrUrl: string | undefined): string {
  if (!siteKeyOrUrl) return EMPOWER_SITES.CLASSIC;
  // Accept a site key like "CLASSIC" or "EMPOWER"
  if (siteKeyOrUrl in EMPOWER_SITES) {
    return EMPOWER_SITES[siteKeyOrUrl as EmpowerSiteKey];
  }
  // Accept a known URL directly (for backward compat with existing tokens)
  if (EMPOWER_SITE_URLS.has(siteKeyOrUrl as typeof EMPOWER_SITES[EmpowerSiteKey])) {
    return siteKeyOrUrl;
  }
  // Unknown value — default to CLASSIC to prevent SSRF
  return EMPOWER_SITES.CLASSIC;
}

// Auth flow types

export interface IdentifyResponse {
  csrf: string;
  challengeMethods: string[];
  cookies: Record<string, string>;
  userGuid?: string;
  userStatus?: string;
}

export interface ChallengeResponse {
  csrf: string;
  status: string;
}

// Account types

export interface Account {
  accountId: string;
  accountName: string;
  /** New Empower API uses `name` instead of `accountName` */
  name?: string;
  originalName?: string;
  firmName: string;
  accountType: string;
  accountTypeGroup: string;
  productType?: string;
  balance: number;
  currentBalance?: number;
  isAsset: boolean;
  isLiability?: boolean;
  currency?: string;
  lastRefreshed?: string | number;
  isOnUs?: boolean;
  /** Empty string = active on new Empower site (no isActive field) */
  closedDate?: string;
  /** Classic site only — not present on new Empower API */
  isActive?: boolean;
  creditLimit?: number;
  availableCredit?: number;
  minPayment?: number;
  paymentDueDate?: string;
  interestRate?: number;
  originalLoanAmount?: number;
}

export interface AccountsResponse {
  spHeader: SpHeader;
  spData: {
    accounts: Account[];
    networth?: number;
  };
}

// Transaction types

export interface Transaction {
  userTransactionId: number;
  accountId: string;
  accountName?: string;
  transactionDate: string;
  simpleDescription: string;
  description: string;
  originalDescription?: string;
  amount: number;
  categoryId: number;
  categoryName?: string;
  merchant?: string;
  isSpending: boolean;
  isIncome: boolean;
  isPending: boolean;
}

export interface TransactionsResponse {
  spHeader: SpHeader;
  spData: {
    transactions: Transaction[];
    intervalType?: string;
    startDate: string;
    endDate: string;
  };
}

// Net worth types

export interface NetWorthDataPoint {
  date: string;
  networth: number;
  assets: number;
  liabilities: number;
}

export interface NetWorthResponse {
  spHeader: SpHeader;
  spData: {
    histories: NetWorthDataPoint[];
    currentNetworth?: number;
    intervalType?: string;
  };
}

// Cash flow types

export interface CashFlowCategory {
  categoryId: number;
  categoryName: string;
  amount: number;
  transactionCount: number;
}

export interface CashFlowResponse {
  spHeader: SpHeader;
  spData: {
    totalIncome: number;
    totalExpense: number;
    netCashFlow: number;
    incomeCategories?: CashFlowCategory[];
    expenseCategories?: CashFlowCategory[];
    startDate: string;
    endDate: string;
  };
}

// Holdings types

export interface Holding {
  ticker?: string;
  description: string;
  accountName?: string;
  accountId?: string;
  quantity: number;
  value: number;
  costBasis?: number;
  gainLoss?: number;
  gainLossPercent?: number;
  percentOfAccount?: number;
  price?: number;
  holdingType?: string;
  assetClass?: string;
  source?: string;
}

export interface HoldingsResponse {
  spHeader: SpHeader;
  spData: {
    holdings: Holding[];
    totalValue?: number;
  };
}

// Common types

export interface SpHeader {
  SP_HEADER_VERSION: number;
  userGuid?: string;
  authLevel: string;
  csrf: string;
  status: string;
  success: boolean;
  errors?: SpError[];
}

export interface SpError {
  code: number;
  message: string;
  details?: Record<string, unknown>;
}

// Raw API response wrapper
export interface EmpowerApiResponse {
  spHeader: SpHeader;
  spData?: Record<string, unknown>;
}
