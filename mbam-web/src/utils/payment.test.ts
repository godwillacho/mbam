import { describe, expect, it } from "vitest";
import { calculatePendingAmount } from "./payment";

describe("pending payment calculation", () => {
  it("subtracts the amount paid from the transaction total", () => {
    expect(calculatePendingAmount(10_000, 4_000)).toBe(6_000);
  });

  it("treats an empty or invalid payment as nothing paid", () => {
    expect(calculatePendingAmount(10_000, Number.NaN)).toBe(10_000);
  });

  it("never returns a negative pending amount", () => {
    expect(calculatePendingAmount(10_000, 12_000)).toBe(0);
  });
});
