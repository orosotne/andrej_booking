export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    return new ApiError(body.error ?? res.statusText, res.status, body.code);
  } catch {
    return new ApiError(res.statusText, res.status);
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}
