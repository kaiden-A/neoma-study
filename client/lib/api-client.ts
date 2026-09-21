export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname);
    // A full navigation on purpose: it drops any client state that belonged to
    // the signed-out session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${next}`;
  }
  return res;
}

async function readError(res: Response): Promise<ApiError> {
  let message = "Something went wrong.";
  let details: unknown;
  try {
    const body = (await res.json()) as { error?: unknown; details?: unknown };
    if (typeof body.error === "string") message = body.error;
    details = body.details;
  } catch {
    // non-JSON error body
  }
  if (res.status === 401) message = message === "Something went wrong." ? "Not signed in." : message;
  return new ApiError(res.status, message, details);
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw await readError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiJson<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiDelete<T = { ok: boolean }>(path: string): Promise<T> {
  return apiJson<T>(path, { method: "DELETE" });
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await apiFetch(path, { method: "POST", body: form });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}
