// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../services/apiClient";
import ReportsPage from "./ReportsPage";

const { loadReport } = vi.hoisted(() => ({
  loadReport: vi.fn(),
}));

vi.mock("../../security/accessControl", () => ({
  getCurrentMember: vi.fn(() => ({
    roleId: "role-business-admin",
  })),
}));

vi.mock("../../components/charts/AuthorizedLineChart", () => ({
  default: ({ label }: { label: string }) => <div>{label} chart</div>,
}));

vi.mock("../../components/charts/TimeframeControl", () => ({
  default: ({
    onChange,
    value,
  }: {
    onChange: (value: "daily" | "weekly") => void;
    value: "daily" | "weekly";
  }) => (
    <button
      onClick={() => onChange(value === "daily" ? "weekly" : "daily")}
      type="button"
    >
      change timeframe
    </button>
  ),
}));

vi.mock("../../services/reportService", () => ({
  loadReport,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("ReportsPage states", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    loadReport.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows loading first and then the empty-state copy", async () => {
    const pending = deferred<{
      series: [];
      dimension: string;
      timeframe: "daily";
      timezone: string;
      starts_at: string;
      ends_at: string;
    }>();
    loadReport.mockReturnValueOnce(pending.promise);

    await act(async () => {
      root.render(<ReportsPage />);
    });
    expect(container.textContent).toContain("Loading authorized report");

    await act(async () => {
      pending.resolve({
        dimension: "shops",
        timeframe: "daily",
        timezone: "UTC",
        starts_at: "2026-06-19T00:00:00Z",
        ends_at: "2026-06-19T23:59:59Z",
        series: [],
      });
      await pending.promise;
    });

    expect(container.textContent).toContain(
      "No sales were recorded in this authorized scope and timeframe.",
    );
  });

  it("clears stale report content when a later timeframe request times out", async () => {
    loadReport
      .mockResolvedValueOnce({
        dimension: "shops",
        timeframe: "daily",
        timezone: "UTC",
        starts_at: "2026-06-19T00:00:00Z",
        ends_at: "2026-06-19T23:59:59Z",
        series: [
          {
            entity_id: "shop-1",
            entity_name: "Shop One",
            total_revenue: 1200,
            total_quantity: 5,
            transaction_count: 2,
            points: [],
          },
        ],
      })
      .mockRejectedValueOnce(new ApiClientError("request_timeout", 408));

    await act(async () => {
      root.render(<ReportsPage />);
    });
    expect(container.textContent).toContain("Shop One");

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "The report could not be loaded. No cached broader data is displayed.",
    );
    expect(container.textContent).not.toContain("Shop One");
  });
});
