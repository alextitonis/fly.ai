const BASE_URL = import.meta.env.VITE_SHIT_UNITS_API_ENDPOINT ?? "";

const AUTH_TOKEN_PREFIX = "shit_auth_token";
const tokenKey = (address: string) => `${AUTH_TOKEN_PREFIX}_${address.toLowerCase()}`;

// Tracks the currently connected EOA so the HTTP client can look up the right token.
// Updated by useAuth whenever the wagmi address changes.
let _currentAddress: string | null = null;
export const setCurrentAddress = (address: string | null): void => {
  _currentAddress = address;
};

export const getAuthToken = (address: string): string | null =>
  localStorage.getItem(tokenKey(address));

export const setAuthToken = (address: string, token: string): void =>
  localStorage.setItem(tokenKey(address), token);

export const clearAuthToken = (address: string): void => localStorage.removeItem(tokenKey(address));

export const clearAllAuthTokens = (): void => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(AUTH_TOKEN_PREFIX)) localStorage.removeItem(key);
  }
};

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const customHttpClient = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const token = _currentAddress ? getAuthToken(_currentAddress) : null;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${url}`, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        clearAllAuthTokens();
        throw new Error("Unauthorized");
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry on network errors (fetch throws) too
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error("Request failed after retries");
};

export default customHttpClient;
