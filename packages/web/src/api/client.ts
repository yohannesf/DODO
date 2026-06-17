// Thin JSON fetch wrapper for /api with bearer auth and one refresh-retry.
// Admin/Configure reads stay online; field data paths go through Dexie.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

interface TokenProvider {
  getToken: () => string | null;
  refresh: () => Promise<boolean>;
}

let tokens: TokenProvider = { getToken: () => null, refresh: async () => false };

export function setTokenProvider(provider: TokenProvider) {
  tokens = provider;
}

async function rawRequest(method: string, url: string, body?: unknown) {
  const token = tokens.getToken();
  return fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res = await rawRequest(method, url, body);
  if (res.status === 401 && (await tokens.refresh())) {
    res = await rawRequest(method, url, body);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (json as { error?: string }).error ?? `request failed (${res.status})`,
      (json as { issues?: Array<{ path: string; message: string }> }).issues,
    );
  }
  return json as T;
}

async function rawForm(url: string, form: FormData) {
  const token = tokens.getToken();
  return fetch(url, {
    method: 'POST',
    // no content-type: the browser sets the multipart boundary
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  delete: (url: string) => request<void>('DELETE', url),
  // multipart upload (spec §16.3) with the same one-refresh-retry as request()
  postForm: async <T>(url: string, form: FormData): Promise<T> => {
    let res = await rawForm(url, form);
    if (res.status === 401 && (await tokens.refresh())) res = await rawForm(url, form);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(
        res.status,
        (json as { error?: string }).error ?? `request failed (${res.status})`,
        (json as { issues?: Array<{ path: string; message: string }> }).issues,
      );
    }
    return json as T;
  },
};
