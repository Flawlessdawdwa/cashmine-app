import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';

export type BalanceItem = {
  asset: string;
  decimals: number;
  available: string;
  pending: string;
  claiming: string;
  usdPrice: string;
};
export type Balances = { asOf: string; items: BalanceItem[] };

export type ActivityItem = {
  id: string;
  type: 'accrual' | 'reversal' | 'claim';
  asset: string;
  amount: string;
  status: 'pending' | 'confirmed' | 'completed' | 'failed';
  exchange: string | null;
  createdAt: string;
  relatedId: string | null;
};
export type ActivityPage = { items: ActivityItem[]; nextCursor: string | null };

export type ClaimOptions = {
  asset: string;
  minAmount: string;
  fee: string;
  destinations: { id: string; label: string }[];
};

export type ClaimBody = { asset: string; amount: string; destinationId: string };

export type Claim = {
  id: string;
  asset: string;
  amount: string;
  fee: string;
  receiveAmount: string;
  destinationId: string;
  status: 'pending' | 'completed' | 'failed';
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * `outcomeUnknown` is true when the server may have acted on the request:
 * network failure, client timeout, 504, or a 5xx. For a POST that means
 * "maybe created"; only a definite 4xx means "definitely not created".
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public code: string,
    public outcomeUnknown: boolean,
    public field?: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

let token: string | null = null;
export function setApiToken(t: string | null) {
  token = t;
}

async function request<T>(method: 'GET' | 'POST', path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const controller = new AbortController();
  // The timer covers reading the body too: a 201 whose body never arrives is still "outcome unknown".
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  let json: unknown;
  try {
    res = await fetch(API_BASE_URL + path, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token ?? ''}`,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    try {
      json = await res.json();
    } catch (e) {
      if (res.ok || controller.signal.aborted) throw e;
      json = null; // non-JSON error body (e.g. a proxy page); fall back to status
    }
  } catch {
    const timedOut = controller.signal.aborted;
    throw new ApiError(timedOut ? 'The request timed out' : 'Network error. Check your connection', null, timedOut ? 'TIMEOUT' : 'NETWORK', true);
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) return json as T;

  type ErrorBody = { error?: { code?: string; message?: string; field?: string; retryAfterMs?: number } };
  const err = (json as ErrorBody | null)?.error ?? {};
  const retryAfterHeader = Number(res.headers.get('Retry-After'));
  const retryAfterMs = err.retryAfterMs ?? (retryAfterHeader > 0 ? retryAfterHeader * 1000 : undefined);
  // 408 (request timeout) is as ambiguous as a 5xx: the server may have acted.
  const unknown = res.status >= 500 || res.status === 408;
  throw new ApiError(err.message ?? `HTTP ${res.status}`, res.status, err.code ?? (unknown ? 'SERVER' : 'HTTP'), unknown, err.field, retryAfterMs);
}

/** Retries for GETs are handled by React Query (see hooks/queries.ts). */
const get = <T,>(path: string) => request<T>('GET', path);

export const api = {
  balances: () => get<Balances>('/v1/balances'),
  activity: (cursor?: string | null) =>
    get<ActivityPage>(`/v1/activity?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  claimOptions: (asset: string) => get<ClaimOptions>(`/v1/claim-options?asset=${encodeURIComponent(asset)}`),
  getClaim: (id: string) => get<Claim>(`/v1/claims/${encodeURIComponent(id)}`),
  /** Never retried here: the caller owns the idempotency key and decides when to resend. */
  createClaim: (body: ClaimBody, idempotencyKey: string) =>
    request<Claim>('POST', '/v1/claims', { body, headers: { 'Idempotency-Key': idempotencyKey } }),
};
