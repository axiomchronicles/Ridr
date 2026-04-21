export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
};

export type AuthSessionResponse = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: AuthUser;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  password: string;
};

export type SessionPersistence = "local" | "session";

const AUTH_TOKEN_STORAGE_KEY = "ridr.auth.access_token";
const AUTH_USER_STORAGE_KEY = "ridr.auth.user";
const AUTH_SESSION_CHANGED_EVENT = "ridr.auth.session.changed";

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

  if (configuredBaseUrl) {
    const normalizedBaseUrl = configuredBaseUrl.replace(/\/$/, "");

    if (typeof window !== "undefined") {
      const currentHostname = window.location.hostname.toLowerCase();
      const isCurrentHostLocal = isLocalHostname(currentHostname);
      const isConfiguredHostLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(
        normalizedBaseUrl,
      );

      if (isConfiguredHostLocal && !isCurrentHostLocal) {
        return "/api/v1";
      }

      if (normalizedBaseUrl.startsWith("/") && isCurrentHostLocal) {
        return `http://localhost:8000${normalizedBaseUrl}`;
      }
    }

    return normalizedBaseUrl;
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (isLocalHostname(hostname)) {
      return "http://localhost:8000/api/v1";
    }
  }

  return "/api/v1";
}

const API_BASE_URL = resolveApiBaseUrl();

type ErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

export class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ErrorPayload;

    if (typeof payload.detail === "string") {
      return payload.detail;
    }

    if (Array.isArray(payload.detail) && payload.detail.length > 0) {
      return payload.detail[0]?.msg || "Request failed";
    }
  } catch {
    return `Request failed with status ${response.status}`;
  }

  return `Request failed with status ${response.status}`;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new AuthApiError(message, response.status);
  }

  return (await response.json()) as T;
}

function getStorageByPersistence(mode: SessionPersistence): Storage {
  return mode === "session" ? window.sessionStorage : window.localStorage;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value.trim();
  return cleaned || undefined;
}

export async function registerUser(payload: RegisterPayload): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      first_name: payload.firstName,
      last_name: payload.lastName,
      email: payload.email,
      phone: normalizeOptionalString(payload.phone),
      city: normalizeOptionalString(payload.city),
      password: payload.password,
    }),
  });
}

export async function loginUser(payload: LoginPayload): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  return requestJson<AuthUser>("/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function setStoredUser(user: AuthUser): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  }

  if (window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  }

  notifyAuthSessionChanged();
}

export function notifyAuthSessionChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

export function subscribeToAuthSessionChanged(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {
      return;
    };
  }

  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, listener);
  };
}

export function setAuthSession(
  sessionResponse: AuthSessionResponse,
  persistence: SessionPersistence = "local",
): void {
  if (typeof window === "undefined") {
    return;
  }

  clearAuthSession();

  const storage = getStorageByPersistence(persistence);
  storage.setItem(AUTH_TOKEN_STORAGE_KEY, sessionResponse.access_token);
  storage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(sessionResponse.user));
  notifyAuthSessionChanged();
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ||
    window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  );
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue =
    window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY) ||
    window.localStorage.getItem(AUTH_USER_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
  notifyAuthSessionChanged();
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}
