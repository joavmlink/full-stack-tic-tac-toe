const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

/** Like apiRequest, but also returns the response headers (e.g. the pagination Link header). */
export async function apiRequestWithHeaders<T>(
  path: string,
  { body, ...init }: RequestOptions = {},
): Promise<{ data: T; headers: Headers }> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: body === undefined ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Couldn't reach the server. Is the backend running?");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error;
    throw new ApiError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `Error ${response.status}`);
  }
  return { data: data as T, headers: response.headers };
}

export async function apiRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await apiRequestWithHeaders<T>(path, options)).data;
}
