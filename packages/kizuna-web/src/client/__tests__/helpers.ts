import { vi } from "vitest";

export interface FetchHandler {
  match: (url: string, init?: RequestInit) => boolean;
  response: unknown;
  ok?: boolean;
  status?: number;
}

export function mockFetchByUrl(handlers: FetchHandler[]) {
  return vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const h = handlers.find((handler) => handler.match(url, init));
    if (!h) return Promise.reject(new Error(`Unmocked: ${url}`));
    return Promise.resolve({
      ok: h.ok ?? true,
      status: h.status ?? 200,
      json: () => Promise.resolve(h.response),
    } as Response);
  });
}
