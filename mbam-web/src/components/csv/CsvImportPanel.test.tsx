// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CsvImportPanel, { type CsvFieldDef } from "./CsvImportPanel";

const fields: CsvFieldDef[] = [
  { key: "name", label: "Name", aliases: ["name", "product"], required: true },
  { key: "sku", label: "SKU", aliases: ["sku"] },
];

function csvFile(contents: string): File {
  return new File([contents], "import.csv", { type: "text/csv" });
}

async function uploadFile(container: HTMLDivElement, contents: string) {
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [csvFile(contents)], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("CsvImportPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("auto-guesses column mapping from matching headers and reports mapped rows on confirm", async () => {
    const onImport = vi.fn();
    await act(async () => {
      root.render(<CsvImportPanel fields={fields} onImport={onImport} triggerLabel="Import CSV" />);
    });

    await uploadFile(container, "Name,SKU\nRice,SKU-1\nBeans,SKU-2\n");

    const selects = Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    expect(selects[0].value).toBe("name");
    expect(selects[1].value).toBe("sku");

    const confirmButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "csvImport.confirmMapping");
    expect(confirmButton?.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onImport).toHaveBeenCalledWith([
      { name: "Rice", sku: "SKU-1" },
      { name: "Beans", sku: "SKU-2" },
    ]);
    // The mapping overlay closes after a successful confirm.
    expect(container.querySelector(".csv-mapping-overlay")).toBeNull();
  });

  it("blocks confirm until a required field is mapped, and accepts a manual remap", async () => {
    const onImport = vi.fn();
    await act(async () => {
      root.render(<CsvImportPanel fields={fields} onImport={onImport} triggerLabel="Import CSV" />);
    });

    // "Item" does not match any alias for the required "name" field.
    await uploadFile(container, "Item,SKU\nRice,SKU-1\n");

    const confirmButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "csvImport.confirmMapping");
    expect(confirmButton?.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain("csvImport.requiredFieldMissing");

    const itemColumnSelect = container.querySelectorAll("select")[0] as HTMLSelectElement;
    await act(async () => {
      itemColumnSelect.value = "name";
      itemColumnSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(confirmButton?.hasAttribute("disabled")).toBe(false);
  });

  it("shows an error and no overlay when the CSV file has no data rows", async () => {
    const onImport = vi.fn();
    await act(async () => {
      root.render(<CsvImportPanel fields={fields} onImport={onImport} triggerLabel="Import CSV" />);
    });

    await uploadFile(container, "Name,SKU\n");

    expect(container.textContent).toContain("csvImport.noRows");
    expect(container.querySelector(".csv-mapping-overlay")).toBeNull();
    expect(onImport).not.toHaveBeenCalled();
  });
});
