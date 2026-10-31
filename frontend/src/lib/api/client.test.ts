import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, buildQuery, errorMessage } from "@/lib/api/client";

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("buildQuery", () => {
  it("drops empty values and repeats arrays", () => {
    expect(buildQuery({ page: 2, q: "", status: undefined, ids: [1, 2], overdue: false })).toBe("?page=2&ids=1&ids=2&overdue=false");
    expect(buildQuery({})).toBe("");
  });
});

describe("api requests", () => {
  it("calls the same-origin API with credentials and JSON", async () => {
    const fetchFn = mockFetch(201, { id: 1 });
    await api.post("/payments", { amount: "10.00" }, { "Idempotency-Key": "k-1" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/v1/payments");
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("k-1");
    expect(JSON.parse(init.body)).toEqual({ amount: "10.00" });
  });

  it("returns undefined for 204", async () => {
    mockFetch(204);
    await expect(api.post("/auth/logout")).resolves.toBeUndefined();
  });

  it("parses the backend error envelope", async () => {
    mockFetch(422, { error: { code: "AMOUNT_EXCEEDS_DUE", message: "Amount exceeds the amount due", details: { amount_due: "100.00" } } });
    const error = (await api.post("/payments", {}).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe("AMOUNT_EXCEEDS_DUE");
    expect(error.details).toEqual({ amount_due: "100.00" });
  });

  it("turns network failures into a readable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = (await api.get("/invoices").catch((e: unknown) => e)) as ApiError;
    expect(error.isNetwork).toBe(true);
    expect(errorMessage(error)).toMatch(/cannot reach the server/i);
  });
});

describe("ApiError", () => {
  it("distinguishes a missing endpoint from a missing record", () => {
    expect(new ApiError(404, "NOT_FOUND", "Not Found").isUnavailable).toBe(true);
    expect(new ApiError(404, "NOT_FOUND", "Invoice not found").isUnavailable).toBe(false);
    expect(new ApiError(405, "METHOD_NOT_ALLOWED", "Method Not Allowed").isUnavailable).toBe(true);
  });

  it("maps 422 details to form field paths", () => {
    const error = new ApiError(422, "VALIDATION_ERROR", "Request validation failed", [
      { loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error" },
      { loc: ["body", "lines", 0, "quantity"], msg: "Input should be greater than or equal to 1", type: "greater_than_equal" },
      { loc: ["body", "password"], msg: "Value error, Password must contain a special character", type: "value_error" },
    ]);
    expect(error.fieldErrors).toEqual({
      email: "value is not a valid email address",
      "lines.0.quantity": "Input should be greater than or equal to 1",
      password: "Password must contain a special character",
    });
    expect(errorMessage(error)).toBe("value is not a valid email address");
  });
});
