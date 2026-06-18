import { describe, expect, it } from "vitest";
import { sanitizeLogContext } from "./logger";

describe("logger redaction", () => {
  it("redacts authentication and personal fields recursively", () => {
    expect(
      sanitizeLogContext({
        requestId: "request-1",
        authorization: "Bearer secret",
        nested: {
          customerEmail: "person@example.com",
          operationId: "operation-1",
        },
      }),
    ).toEqual({
      requestId: "request-1",
      authorization: "[Redacted]",
      nested: {
        customerEmail: "[Redacted]",
        operationId: "operation-1",
      },
    });
  });

  it("serializes errors without retaining custom sensitive properties", () => {
    const error = new Error("request failed");
    Object.assign(error, { token: "secret" });

    expect(sanitizeLogContext({ error })).toEqual({
      error: {
        name: "Error",
        message: "request failed",
      },
    });
  });

  it("redacts sensitive values embedded in ordinary strings", () => {
    expect(
      sanitizeLogContext({
        detail:
          "user person@example.com sent Bearer top-secret-value to the API",
      }),
    ).toEqual({
      detail:
        "user [Redacted email] sent Bearer [Redacted] to the API",
    });
  });
});
