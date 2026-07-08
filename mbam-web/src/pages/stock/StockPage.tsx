import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CsvImportPanel, { type CsvFieldDef } from "../../components/csv/CsvImportPanel";
import DevOnly from "../../components/app/DevOnly";
import { workspace } from "../../data/mockWorkspace";
import { canManageProducts, getCurrentMember, getScopedUnits } from "../../routing/accessControl";
import { listBusinesses } from "../../services/business/businessService";
import {
  createProducts,
  listProducts,
  updateProduct,
  type ProductWritePayload,
} from "../../services/products/productService";
import { getProductRevenueReport, type ProductRevenueRow } from "../../services/products/productRevenueService";
import {
  listStockMovements,
  MANUAL_STOCK_MOVEMENT_TYPES,
  recordStockMovement,
  type ManualStockMovementType,
  type StockMovement,
} from "../../services/stock/stockService";
import type { ProductProfile } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { getProductInventorySnapshot } from "../../utils/inventory";
import { getProductSearchText } from "../../utils/productDisplay";
import { canViewDashboardMetric } from "../dashboard/dashboardPermissions";
import "./StockPage.css";

// Small inline icon for the record-movement submit button, matching the
// dependency-free SVG language established on the Record Transaction page
// (see TransactionRecordPage.tsx) since no icon library is installed here.
function RecordMovementIcon() {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

type FormErrors = Record<string, string>;
type SortMode = "alphabetical" | "reverse" | "brand" | "bestSelling";

// Not exported (react-refresh/only-export-components warns on a component
// file exporting non-component bindings) -- nothing outside this file
// imports these today; if that changes, move them to their own module
// instead of re-adding `export` here.
type StockPolicyOption = "allow_negative" | "warn_when_low" | "block_when_empty";

const STOCK_POLICY_OPTIONS: StockPolicyOption[] = [
  "warn_when_low",
  "allow_negative",
  "block_when_empty",
];

interface ProductDraft {
  name: string;
  sku: string;
  brand: string;
  category: string;
  // Deliberately still tracked in the draft (see toDraft/draftPayload) even
  // though the UI below never lets the user edit it anymore -- the backend's
  // update endpoint does a raw column overwrite with no "leave unchanged"
  // semantics (see products::repository::update), so this must keep mirroring
  // the product's current server-side quantity or a product-detail save
  // would silently null out its tracked quantity. The Stock ledger below
  // (record-movement form) is now the ONLY UI path that actually changes
  // this value, closing the gap where editing a product here used to bypass
  // the audit trail/stock_policy enforcement entirely.
  availableQuantity: string;
  expiryDate: string;
  costPrice: string;
  businessUnitId?: string;
  // Not part of productDraftFields/the bulk "add products" grid on purpose --
  // new products default to warn_when_low server-side; the policy selector
  // only appears once a product exists, in the per-row edit table below.
  stockPolicy: StockPolicyOption;
}

// Used by the "add products"/CSV-import grid for brand-new products only --
// setting an initial quantity here is fine (there's no existing ledger to
// contradict yet). Editing an EXISTING product's quantity is what got
// removed from the UI below; new-product creation is unaffected.
const productDraftFields: Array<keyof ProductDraft> = ["name", "sku", "brand", "category", "availableQuantity", "expiryDate", "costPrice"];

function createEmptyProductDraft(): ProductDraft {
  return {
    name: "",
    sku: "",
    brand: "",
    category: "",
    availableQuantity: "",
    expiryDate: "",
    costPrice: "",
    businessUnitId: "",
    stockPolicy: "warn_when_low",
  };
}

function hasProductDraftContent(draft: ProductDraft): boolean {
  return productDraftFields.some((field) => String(draft[field] ?? "").trim().length > 0);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function findSimilarProductName(draft: ProductDraft): string | null {
  const normalizedName = normalizeText(draft.name);
  if (normalizedName.length < 3) return null;

  const nameTokens = new Set(normalizedName.split(" ").filter((token) => token.length > 2));
  const similarProduct = workspace.products.find((product) => {
    const normalizedProductName = normalizeText(product.name);
    if (!normalizedProductName) return false;
    if (normalizedProductName.includes(normalizedName) || normalizedName.includes(normalizedProductName)) return true;

    const productTokens = normalizedProductName.split(" ").filter((token) => token.length > 2);
    const sharedTokens = productTokens.filter((token) => nameTokens.has(token));
    return sharedTokens.length >= Math.min(2, nameTokens.size);
  });

  return similarProduct?.name ?? null;
}

function searchTextForRow(row: ProductRevenueRow, product?: ProductProfile): string {
  return [
    row.productName,
    row.sku,
    row.category,
    row.businessName,
    row.descriptor,
    row.manufacturer,
    row.brand,
    row.variant,
    row.packageSize,
    row.unitOfMeasure,
    row.barcode,
    product ? getProductSearchText(product) : undefined,
  ].filter(Boolean).join(" ").toLowerCase();
}

function rowBusinessUnitId(row: ProductRevenueRow): string {
  const withUnit = row as ProductRevenueRow & { businessUnitId?: string };
  return withUnit.businessUnitId ?? workspace.products.find((product) => product.id === row.productId)?.businessUnitId ?? "";
}

function toDraft(product: ProductProfile | undefined, row: ProductRevenueRow): ProductDraft {
  const availableQuantity = product?.availableQuantity ?? row.availableQuantity;
  const costPrice = product?.costPrice ?? row.costPrice;
  return {
    name: product?.name ?? row.productName,
    sku: product?.sku ?? row.sku,
    brand: product?.brand ?? row.brand ?? "",
    category: product?.category ?? row.category,
    availableQuantity: typeof availableQuantity === "number" ? String(availableQuantity) : "",
    expiryDate: product?.expiryDate ?? row.expiryDate ?? "",
    costPrice: typeof costPrice === "number" ? String(costPrice) : "",
    businessUnitId: product?.businessUnitId ?? rowBusinessUnitId(row),
    stockPolicy: (product?.stockPolicy as StockPolicyOption | undefined) ?? "warn_when_low",
  };
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function draftPayload(draft: ProductDraft, businessId: string, businessUnitId: string): ProductWritePayload {
  return {
    businessId,
    businessUnitId,
    name: draft.name.trim(),
    sku: draft.sku.trim() || undefined,
    brand: draft.brand.trim() || undefined,
    category: draft.category.trim() || "other",
    availableQuantity: optionalNumber(draft.availableQuantity),
    expiryDate: draft.expiryDate || undefined,
    costPrice: optionalNumber(draft.costPrice),
    stockPolicy: draft.stockPolicy,
    defaultPrice: 0,
  };
}

function rowProfile(row: ProductRevenueRow, draft: ProductDraft): ProductProfile {
  return {
    id: row.productId,
    businessId: row.businessId,
    businessUnitId: draft.businessUnitId || rowBusinessUnitId(row),
    name: draft.name,
    sku: draft.sku || undefined,
    category: draft.category,
    brand: draft.brand || undefined,
    availableQuantity: optionalNumber(draft.availableQuantity),
    lowStockThreshold: row.lowStockThreshold,
    stockPolicy: draft.stockPolicy,
    expiryDate: draft.expiryDate || undefined,
    costPrice: optionalNumber(draft.costPrice),
    defaultPrice: row.defaultPrice ?? 0,
    timesSold: row.quantitySold,
    serverVersion: row.serverVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowPayload(row: ProductRevenueRow, draft: ProductDraft): ProductWritePayload {
  return {
    ...draftPayload(draft, row.businessId ?? "", draft.businessUnitId || rowBusinessUnitId(row)),
    manufacturer: row.manufacturer,
    variant: row.variant,
    packageSize: row.packageSize,
    unitOfMeasure: row.unitOfMeasure,
    barcode: row.barcode,
    lowStockThreshold: row.lowStockThreshold,
    defaultPrice: row.defaultPrice ?? 0,
  };
}

function compareText(a: string | undefined, b: string | undefined) {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function sortRows(rows: ProductRevenueRow[], drafts: Record<string, ProductDraft>, sortMode: SortMode): ProductRevenueRow[] {
  return [...rows].sort((a, b) => {
    const draftA = drafts[a.productId];
    const draftB = drafts[b.productId];

    if (sortMode === "bestSelling") return b.pricePoints.length - a.pricePoints.length || b.quantitySold - a.quantitySold;
    if (sortMode === "brand") return compareText(draftA?.brand ?? a.brand, draftB?.brand ?? b.brand) || compareText(draftA?.name ?? a.productName, draftB?.name ?? b.productName);
    if (sortMode === "reverse") return compareText(draftB?.name ?? b.productName, draftA?.name ?? a.productName);
    return compareText(draftA?.name ?? a.productName, draftB?.name ?? b.productName);
  });
}

function currencyFor(businessId: string): string {
  return workspace.businesses.find((business) => business.id === businessId)?.currency
    ?? workspace.masterAccount.currency;
}

function productLabel(product: ProductProfile | undefined, fallbackId: string): string {
  if (!product) return fallbackId;
  return product.sku ? `${product.name} (${product.sku})` : product.name;
}

export default function StockPage() {
  const { t } = useTranslation();
  const currentMember = useMemo(() => getCurrentMember(), []);
  const scopedUnits = useMemo(() => getScopedUnits(currentMember), [currentMember]);
  const scopedUnitIds = useMemo(() => new Set(scopedUnits.map((unit) => unit.id)), [scopedUnits]);

  // ---- Stock ledger + record-movement state ----
  const [productOptions, setProductOptions] = useState<ProductProfile[]>(workspace.products);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [filterProductId, setFilterProductId] = useState("");
  const [filterUnitId, setFilterUnitId] = useState("");

  const [formProductId, setFormProductId] = useState("");
  const [movementType, setMovementType] = useState<ManualStockMovementType>("purchase");
  const [quantityDelta, setQuantityDelta] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formStatus, setFormStatus] = useState<"idle" | "saving" | "saved">("idle");

  // ---- Product catalog/management state (merged in from the former
  // pages/products/ProductRevenuePage.tsx -- see REPOSITORY_MAP.md and
  // debug.log for why the two pages were consolidated) ----
  const [rows, setRows] = useState<ProductRevenueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");
  const [isEditingProducts, setIsEditingProducts] = useState(false);
  const [isAddingProducts, setIsAddingProducts] = useState(false);
  const [csvImportMessage, setCsvImportMessage] = useState("");
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [newProductDrafts, setNewProductDrafts] = useState<ProductDraft[]>(() => [createEmptyProductDraft()]);
  const [businessOptions, setBusinessOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [unitOptions, setUnitOptions] = useState(scopedUnits);
  const [selectedBusinessId, setSelectedBusinessId] = useState(currentMember.businessId ?? scopedUnits[0]?.businessId ?? "");
  const [selectedBusinessUnitId, setSelectedBusinessUnitId] = useState(currentMember.businessUnitId ?? scopedUnits[0]?.id ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  // Gates the whole product-catalog section (search/sort, add/edit, table).
  // Deliberately NOT a hard page-level redirect the way the old standalone
  // ProductRevenuePage did (`if (!canViewDashboardMetric(...)) return
  // <Navigate .../>`) -- a member who can only view/record stock movements
  // (no product.view/screen.products) must still be able to reach the
  // ledger and record-movement form below, since this page now serves both
  // audiences. See routing/ProtectedRoute.tsx's altRouteKey for the
  // matching route-level relaxation.
  const canViewProductsSection = canViewDashboardMetric(currentMember, "products");
  const canManage = canManageProducts(currentMember);

  const scopedProductOptions = useMemo(
    () => productOptions.filter((product) => !product.businessUnitId || scopedUnitIds.has(product.businessUnitId)),
    [productOptions, scopedUnitIds],
  );

  // This page is reachable with EITHER capability (see accessControl.ts's
  // routeAlternatePermission), so the two sections show independently:
  // a hybrid role granted only "Add stock movements" (stock.movement.create,
  // no screen.stock/stock.movement.view) sees just the form, not the ledger,
  // and vice versa. Accounts without an explicit `permissions` array (mock/
  // offline/demo fallback) default to seeing both, matching every other
  // permission check in accessControl.ts.
  const canViewLedger = currentMember.permissions
    ? currentMember.permissions.includes("screen.stock") || currentMember.permissions.includes("stock.movement.view")
    : true;
  const canCreateMovement = currentMember.permissions
    ? currentMember.permissions.includes("stock.movement.create")
    : true;

  const productCsvFields: CsvFieldDef[] = useMemo(() => [
    { key: "name", label: t("productRevenue.fields.name"), aliases: ["name", "product", "productname", "item", "itemname"], required: true },
    { key: "sku", label: t("productRevenue.fields.sku"), aliases: ["sku", "code", "productcode", "itemcode"] },
    { key: "brand", label: t("productRevenue.fields.brand"), aliases: ["brand", "manufacturer"] },
    { key: "category", label: t("productRevenue.fields.category"), aliases: ["category", "type"] },
    { key: "availableQuantity", label: t("productRevenue.fields.availableQuantity"), aliases: ["availablequantity", "quantity", "qty", "stock", "stockquantity"] },
    { key: "expiryDate", label: t("productRevenue.fields.expiryDate"), aliases: ["expirydate", "expirationdate", "expiry", "expires"] },
    { key: "costPrice", label: t("productRevenue.fields.costPrice"), aliases: ["costprice", "cost", "unitcost", "purchaseprice"] },
    { key: "businessUnitId", label: t("productRevenue.csvBusinessUnitField"), aliases: ["businessunitid", "unitid", "shopid"] },
  ], [t]);

  useEffect(() => {
    let active = true;
    listProducts(workspace.products)
      .then((result) => {
        if (active) setProductOptions(result.products);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canViewLedger) {
      setIsLoadingMovements(false);
      return;
    }
    let active = true;
    setIsLoadingMovements(true);
    setLoadError("");
    listStockMovements({
      productId: filterProductId || undefined,
      businessUnitId: filterUnitId || undefined,
    })
      .then((result) => {
        if (active) setMovements(result);
      })
      .catch((fetchError: unknown) => {
        if (active) setLoadError(fetchError instanceof Error ? fetchError.message : t("stock.loadError"));
      })
      .finally(() => {
        if (active) setIsLoadingMovements(false);
      });
    return () => {
      active = false;
    };
  }, [canViewLedger, filterProductId, filterUnitId, t]);

  useEffect(() => {
    if (!canViewProductsSection) {
      setIsLoading(false);
      return;
    }
    let ignore = false;
    setIsLoading(true);
    setError(null);

    getProductRevenueReport(currentMember, t("common.noSku"))
      .then((report) => {
        if (ignore) return;
        setRows(report.rows);
        setProductDrafts((current) => {
          const next = { ...current };
          report.rows.forEach((row) => {
            if (!next[row.productId]) {
              next[row.productId] = toDraft(workspace.products.find((product) => product.id === row.productId), row);
            }
          });
          return next;
        });
      })
      .catch((reportError: unknown) => {
        if (ignore) return;
        setRows([]);
        setError(reportError instanceof Error ? reportError.message : t("productRevenue.loadError"));
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [canViewProductsSection, currentMember, refreshVersion, t]);

  useEffect(() => {
    if (!canViewProductsSection) return;
    const fallbackBusinesses = workspace.businesses.map(({ id, name }) => ({ id, name }));
    setUnitOptions(getScopedUnits(currentMember));
    listBusinesses()
      .then((businesses) => {
        const scopedBusinessIds = new Set(getScopedUnits(currentMember).map((unit) => unit.businessId));
        const visibleBusinesses = businesses.filter((business) => scopedBusinessIds.has(business.id));
        const nextBusinesses = visibleBusinesses.length > 0 ? visibleBusinesses : fallbackBusinesses;
        setBusinessOptions(nextBusinesses);
        setSelectedBusinessId((current) => current || currentMember.businessId || nextBusinesses[0]?.id || "");
      })
      .catch(() => {
        setBusinessOptions(fallbackBusinesses);
        setSelectedBusinessId((current) => current || currentMember.businessId || fallbackBusinesses[0]?.id || "");
      });
  }, [canViewProductsSection, currentMember, currentMember.businessId]);

  const selectedUnitOptions = useMemo(
    () => unitOptions.filter((unit) => unit.businessId === selectedBusinessId && unit.status === "active"),
    [selectedBusinessId, unitOptions],
  );

  useEffect(() => {
    if (selectedUnitOptions.length > 0 && !selectedUnitOptions.some((unit) => unit.id === selectedBusinessUnitId)) {
      setSelectedBusinessUnitId(selectedUnitOptions[0].id);
    }
  }, [selectedBusinessUnitId, selectedUnitOptions]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matchedRows = !query ? rows : rows.filter((row) => {
      const product = workspace.products.find((item) => item.id === row.productId);
      const draft = productDrafts[row.productId];
      const draftText = draft ? Object.values(draft).join(" ").toLowerCase() : "";
      return searchTextForRow(row, product).includes(query) || draftText.includes(query);
    });

    return sortRows(matchedRows, productDrafts, sortMode);
  }, [productDrafts, rows, searchQuery, sortMode]);

  const updateDraft = (productId: string, field: Exclude<keyof ProductDraft, "stockPolicy" | "availableQuantity">, value: string) => {
    const row = rows.find((item) => item.productId === productId);
    if (!row) return;

    setProductDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] ?? toDraft(workspace.products.find((product) => product.id === productId), row)),
        [field]: value,
      },
    }));
  };

  const updateStockPolicy = (productId: string, stockPolicy: StockPolicyOption) => {
    const row = rows.find((item) => item.productId === productId);
    if (!row) return;

    setProductDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] ?? toDraft(workspace.products.find((product) => product.id === productId), row)),
        stockPolicy,
      },
    }));
  };

  const openAddProducts = () => {
    setIsEditingProducts(false);
    setIsAddingProducts(true);
    setCsvImportMessage("");
    setSelectedBusinessUnitId((current) => current || selectedUnitOptions[0]?.id || "");
  };

  const saveNewProducts = async () => {
    const drafts = newProductDrafts.filter((draft) => draft.name.trim().length > 0);
    if (!selectedBusinessId || !selectedBusinessUnitId || drafts.length === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      await createProducts(drafts.map((draft) => draftPayload(draft, selectedBusinessId, draft.businessUnitId || selectedBusinessUnitId)));
      setNewProductDrafts([createEmptyProductDraft()]);
      setIsAddingProducts(false);
      setRefreshVersion((current) => current + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("productRevenue.loadError"));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProductEditing = async () => {
    if (!isEditingProducts) {
      setIsEditingProducts(true);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await Promise.all(rows.map((row) => {
        const draft = productDrafts[row.productId];
        const profile = draft ? rowProfile(row, draft) : undefined;
        if (!draft || !row.businessId || !profile?.businessUnitId) return Promise.resolve();
        return updateProduct(row.productId, rowPayload(row, draft), profile.serverVersion);
      }));
      setIsEditingProducts(false);
      setRefreshVersion((current) => current + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("productRevenue.loadError"));
    } finally {
      setIsSaving(false);
    }
  };

  const updateNewProductDraft = (index: number, field: keyof ProductDraft, value: string) => {
    setCsvImportMessage("");
    setNewProductDrafts((current) => {
      const next = current.map((draft, draftIndex) => draftIndex === index ? { ...draft, [field]: value } : draft);
      const lastDraft = next[next.length - 1];
      if (index === next.length - 1 && hasProductDraftContent(lastDraft)) {
        next.push(createEmptyProductDraft());
      }
      return next;
    });
  };

  const handleProductCsvImport = (records: Array<Record<string, string>>) => {
    const importedDrafts = records
      .map((record) => ({
        name: record.name ?? "",
        sku: record.sku ?? "",
        brand: record.brand ?? "",
        category: record.category ?? "",
        availableQuantity: record.availableQuantity ?? "",
        expiryDate: record.expiryDate ?? "",
        costPrice: record.costPrice ?? "",
        businessUnitId: record.businessUnitId ?? "",
        // CSV imports go through the bulk "add products" grid, which never
        // exposes stockPolicy (see the ProductDraft field comment) -- new
        // products always default to warn_when_low server-side.
        stockPolicy: "warn_when_low" as StockPolicyOption,
      }))
      .filter(hasProductDraftContent);

    if (importedDrafts.length === 0) {
      setCsvImportMessage(t("productRevenue.csvNoRows"));
      return;
    }

    setIsEditingProducts(false);
    setIsAddingProducts(true);
    setNewProductDrafts((current) => {
      const existingDrafts = current.filter(hasProductDraftContent);
      return [...existingDrafts, ...importedDrafts, createEmptyProductDraft()];
    });
    setCsvImportMessage(t("productRevenue.csvImported", { count: importedDrafts.length }));
  };

  const validateForm = (): FormErrors => {
    const nextErrors: FormErrors = {};
    const parsedQuantity = Number(quantityDelta);
    const parsedUnitCost = unitCost.trim() === "" ? null : Number(unitCost);

    if (!formProductId) nextErrors.product = t("stock.validation.productRequired");
    if (!MANUAL_STOCK_MOVEMENT_TYPES.includes(movementType)) {
      nextErrors.movementType = t("stock.validation.movementTypeInvalid");
    }
    if (quantityDelta.trim() === "" || !Number.isFinite(parsedQuantity) || parsedQuantity === 0) {
      nextErrors.quantityDelta = t("stock.validation.quantityInvalid");
    }
    if (parsedUnitCost !== null && (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0)) {
      nextErrors.unitCost = t("stock.validation.unitCostInvalid");
    }
    if (note.trim().length > 240) nextErrors.note = t("stock.validation.noteTooLong");

    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateForm();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFormStatus("saving");
    try {
      const saved = await recordStockMovement({
        productId: formProductId,
        movementType,
        quantityDelta: Number(quantityDelta),
        unitCost: unitCost.trim() === "" ? undefined : Number(unitCost),
        note: note.trim() || undefined,
      });
      setMovements((current) => [saved, ...current]);
      setQuantityDelta("");
      setUnitCost("");
      setNote("");
      setFormStatus("saved");
    } catch (saveError) {
      setFormStatus("idle");
      setErrors({ submit: saveError instanceof Error ? saveError.message : t("stock.recordError") });
    }
  };

  return (
    <section className="page-grid stock-page product-revenue-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("stock.eyebrow")}</span>
          <h2>{t("stock.title")}</h2>
          <DevOnly><p>{t("stock.description")}</p></DevOnly>
        </div>
        {canViewProductsSection && canManage && (
          <div className="dashboard-heading-action">
            <button
              className="primary-btn"
              type="button"
              disabled={isAddingProducts || isSaving}
              onClick={openAddProducts}
            >
              {t("productRevenue.addProduct")}
            </button>
          </div>
        )}
      </div>

      {canViewProductsSection && (
        <>
          {error && <div className="product-revenue-error">{error}</div>}

          <div className="filter-bar card product-table-controls">
            <div>
              <label htmlFor="product-search">{t("productRevenue.searchLabel")}</label>
              <input id="product-search" type="search" value={searchQuery} placeholder={t("productRevenue.searchPlaceholder")} onChange={(event) => setSearchQuery(event.target.value)} />
              <small>{t("productRevenue.searchHint")}</small>
            </div>
            <div>
              <label htmlFor="product-sort">{t("productRevenue.sortLabel")}</label>
              <select id="product-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="alphabetical">{t("productRevenue.sortOptions.alphabetical")}</option>
                <option value="reverse">{t("productRevenue.sortOptions.reverse")}</option>
                <option value="brand">{t("productRevenue.sortOptions.brand")}</option>
                <option value="bestSelling">{t("productRevenue.sortOptions.bestSelling")}</option>
              </select>
            </div>
          </div>

          {isAddingProducts && (
            <article className="card add-products-card">
              <header className="add-products-header">
                <div>
                  <span className="eyebrow">{t("productRevenue.addProducts")}</span>
                  <h3>{t("productRevenue.addProductsTitle")}</h3>
                  <p className="card-muted">{t("productRevenue.addProductsHint")}</p>
                </div>
                <div className="dashboard-heading-action">
                  <select
                    aria-label="Business"
                    value={selectedBusinessId}
                    onChange={(event) => {
                      setSelectedBusinessId(event.target.value);
                      setSelectedBusinessUnitId("");
                    }}
                  >
                    {businessOptions.map((business) => (
                      <option key={business.id} value={business.id}>{business.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Shop or unit"
                    value={selectedBusinessUnitId}
                    onChange={(event) => setSelectedBusinessUnitId(event.target.value)}
                  >
                    {selectedUnitOptions.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                  <CsvImportPanel
                    fields={productCsvFields}
                    onImport={handleProductCsvImport}
                    triggerLabel={t("productRevenue.importCsv")}
                  />
                  <button className="secondary-btn" type="button" onClick={() => setIsAddingProducts(false)}>{t("productRevenue.cancelAddProducts")}</button>
                  <button className="primary-btn" type="button" disabled={isSaving || !selectedBusinessId || !selectedBusinessUnitId} onClick={saveNewProducts}>{t("productRevenue.saveNewProducts")}</button>
                </div>
              </header>

              {csvImportMessage && <div className="product-revenue-source-note">{csvImportMessage}</div>}

              <div className="add-products-table-wrap">
                <table className="data-table add-products-table">
                  <thead>
                    <tr>
                      <th>{t("productRevenue.property")}</th>
                      {newProductDrafts.map((draft, index) => {
                        const similarProductName = findSimilarProductName(draft);
                        return (
                          <th key={`new-product-${index}`}>
                            <span>{t("productRevenue.newProductColumn", { number: index + 1 })}</span>
                            {similarProductName && <small className="similar-product-label">{t("productRevenue.similarProduct", { name: similarProductName })}</small>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {productDraftFields.map((field) => (
                      <tr key={field}>
                        <th>{t(`productRevenue.fields.${field}`)}</th>
                        {newProductDrafts.map((draft, index) => (
                          <td key={`${field}-${index}`}>
                            <input
                              type={field === "availableQuantity" || field === "costPrice" ? "number" : field === "expiryDate" ? "date" : "text"}
                              min={field === "availableQuantity" || field === "costPrice" ? "0" : undefined}
                              value={String(draft[field] ?? "")}
                              placeholder={t(`productRevenue.fields.${field}`)}
                              onChange={(event) => updateNewProductDraft(index, field, event.target.value)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          {isLoading && <p className="card-muted">{t("productRevenue.loading")}</p>}
          {!isLoading && filteredRows.length === 0 && !error && <p className="card-muted">{t("productRevenue.noSearchResults")}</p>}

          {!isLoading && filteredRows.length > 0 && (
            <article className="table-card product-management-table-card">
              <header>
                <div>
                  <h3>{t("productRevenue.productTable")}</h3>
                  <small>{t("transactions.filteredRecords", { count: filteredRows.length })}</small>
                </div>
                {canManage && (
                  <div className="dashboard-heading-action">
                    <button className={isEditingProducts ? "primary-btn" : "secondary-btn"} type="button" disabled={isAddingProducts || isSaving} onClick={() => void toggleProductEditing()}>
                      {isEditingProducts ? t("productRevenue.doneEditing") : t("productRevenue.editProducts")}
                    </button>
                  </div>
                )}
              </header>

              <table className="data-table product-management-table">
                <thead>
                  <tr>
                    <th>{t("productRevenue.product")}</th>
                    <th>{t("transactionRecord.unit")}</th>
                    <th>{t("productRevenue.sku")}</th>
                    <th>{t("productRevenue.brand")}</th>
                    <th>{t("productRevenue.category")}</th>
                    <th>{t("productRevenue.availableQuantity")}</th>
                    <th>{t("productRevenue.stockPolicy")}</th>
                    <th>{t("productRevenue.expiryDate")}</th>
                    <th>{t("productRevenue.costPrice")}</th>
                    <th>{t("roleDashboard.labels.revenue")}</th>
                    <th><button className="table-sort-button" type="button" onClick={() => setSortMode("bestSelling")}>{t("productRevenue.bestSellingProducts")}</button></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const product = workspace.products.find((item) => item.id === row.productId);
                    const draft = productDrafts[row.productId] ?? toDraft(product, row);
                    const rowUnitOptions = unitOptions.filter((unit) => unit.businessId === row.businessId && unit.status === "active");
                    const selectedUnitName = unitOptions.find((unit) => unit.id === (draft.businessUnitId || rowBusinessUnitId(row)))?.name ?? "—";
                    const inventory = product
                      ? getProductInventorySnapshot(product)
                      : typeof row.availableQuantity === "number"
                        ? { availableQuantity: row.availableQuantity, status: "unknown" as const }
                        : undefined;
                    const transactionCount = row.pricePoints.length;

                    return (
                      <tr key={row.productId}>
                        <td>{isEditingProducts ? <input value={draft.name} onChange={(event) => updateDraft(row.productId, "name", event.target.value)} /> : <strong>{draft.name}</strong>}</td>
                        <td>{isEditingProducts ? (
                          <select value={draft.businessUnitId || rowBusinessUnitId(row)} onChange={(event) => updateDraft(row.productId, "businessUnitId", event.target.value)}>
                            {rowUnitOptions.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                          </select>
                        ) : selectedUnitName}</td>
                        <td>{isEditingProducts ? <input value={draft.sku} onChange={(event) => updateDraft(row.productId, "sku", event.target.value)} /> : draft.sku}</td>
                        <td>{isEditingProducts ? <input value={draft.brand} onChange={(event) => updateDraft(row.productId, "brand", event.target.value)} /> : draft.brand || "—"}</td>
                        <td>{isEditingProducts ? <input value={draft.category} onChange={(event) => updateDraft(row.productId, "category", event.target.value)} /> : t(`categories.${draft.category}`)}</td>
                        <td>
                          {/* Read-only everywhere, even in edit mode: changing quantity now only
                              happens through the audited stock-movement form below (see the
                              ProductDraft.availableQuantity comment for why this used to be an
                              unaudited raw overwrite). */}
                          <span className={`stock-quantity-cell stock-status-${inventory?.status ?? "unknown"}`}>
                            {inventory?.availableQuantity ?? t("productRevenue.notTracked")}
                            {(inventory?.status === "low" || inventory?.status === "out") && (
                              <span className="stock-status-badge">
                                {t(`productRevenue.stockStatus.${inventory.status}`)}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          {isEditingProducts ? (
                            <select value={draft.stockPolicy} onChange={(event) => updateStockPolicy(row.productId, event.target.value as StockPolicyOption)}>
                              {STOCK_POLICY_OPTIONS.map((option) => (
                                <option key={option} value={option}>{t(`productRevenue.stockPolicyOptions.${option}`)}</option>
                              ))}
                            </select>
                          ) : (
                            t(`productRevenue.stockPolicyOptions.${draft.stockPolicy}`)
                          )}
                        </td>
                        <td>{isEditingProducts ? <input type="date" value={draft.expiryDate} onChange={(event) => updateDraft(row.productId, "expiryDate", event.target.value)} /> : draft.expiryDate || "—"}</td>
                        <td>{isEditingProducts ? <input type="number" min="0" value={draft.costPrice} onChange={(event) => updateDraft(row.productId, "costPrice", event.target.value)} /> : draft.costPrice ? formatMoney(Number(draft.costPrice), workspace.masterAccount.currency) : "—"}</td>
                        <td>{formatMoney(row.totalRevenue, workspace.masterAccount.currency)}</td>
                        <td>
                          <button className="best-selling-cell" type="button" onClick={() => setSortMode("bestSelling")}>
                            <strong>{row.quantitySold}</strong>
                            <small>{t("productRevenue.transactionCount", { count: transactionCount })}</small>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </article>
          )}
        </>
      )}

      {canCreateMovement && (
        <form className="form-card" noValidate onSubmit={(event) => void handleSubmit(event)}>
          <header>
            <h3>{t("stock.recordMovementTitle")}</h3>
            <DevOnly><small>{t("stock.recordMovementSubtitle")}</small></DevOnly>
          </header>

          {Object.keys(errors).length > 0 && (
            <div className="validation-summary" role="alert">
              <strong>{t("stock.validation.summaryTitle")}</strong>
              <ul>
                {Object.entries(errors).map(([field, message]) => <li key={field}>{message}</li>)}
              </ul>
            </div>
          )}

          {formStatus === "saved" && (
            <div className="validation-success" role="status">{t("stock.recordSuccess")}</div>
          )}

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="stock-product">{t("stock.product")}</label>
              <select id="stock-product" value={formProductId} onChange={(event) => setFormProductId(event.target.value)}>
                <option value="">{t("stock.selectProduct")}</option>
                {scopedProductOptions.map((product) => (
                  <option key={product.id} value={product.id}>{productLabel(product, product.id)}</option>
                ))}
              </select>
              {errors.product && <span className="field-error">{errors.product}</span>}
            </div>

            <div className="form-field">
              <label htmlFor="stock-movement-type">{t("stock.movementType")}</label>
              <select id="stock-movement-type" value={movementType} onChange={(event) => setMovementType(event.target.value as ManualStockMovementType)}>
                {MANUAL_STOCK_MOVEMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`stock.movementTypes.${type}`)}</option>
                ))}
              </select>
              {errors.movementType && <span className="field-error">{errors.movementType}</span>}
            </div>

            <div className="form-field">
              <label htmlFor="stock-quantity">{t("stock.quantityDelta")}</label>
              <input id="stock-quantity" type="number" step="any" placeholder="0" value={quantityDelta} onChange={(event) => setQuantityDelta(event.target.value)} />
              {errors.quantityDelta ? <span className="field-error">{errors.quantityDelta}</span> : <DevOnly><span className="form-hint">{t("stock.quantityHint")}</span></DevOnly>}
            </div>

            <div className="form-field">
              <label htmlFor="stock-unit-cost">{t("stock.unitCost")}</label>
              <input id="stock-unit-cost" type="number" min="0" step="any" placeholder="0" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
              {errors.unitCost && <span className="field-error">{errors.unitCost}</span>}
            </div>

            <div className="form-field full">
              <label htmlFor="stock-note">{t("stock.note")}</label>
              <textarea id="stock-note" maxLength={240} placeholder={t("stock.notePlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
              {errors.note && <span className="field-error">{errors.note}</span>}
            </div>
          </div>

          <div className="form-actions">
            <button className="primary-btn" type="submit" disabled={formStatus === "saving"}>
              <RecordMovementIcon />
              <span>{t("stock.recordMovement")}</span>
            </button>
          </div>
        </form>
      )}

      {canViewLedger && (
        <>
          <div className="filter-bar card stock-filter-bar">
            <div className="form-field">
              <label htmlFor="stock-filter-product">{t("stock.filterByProduct")}</label>
              <select id="stock-filter-product" value={filterProductId} onChange={(event) => setFilterProductId(event.target.value)}>
                <option value="">{t("stock.allProducts")}</option>
                {scopedProductOptions.map((product) => (
                  <option key={product.id} value={product.id}>{productLabel(product, product.id)}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="stock-filter-unit">{t("stock.filterByUnit")}</label>
              <select id="stock-filter-unit" value={filterUnitId} onChange={(event) => setFilterUnitId(event.target.value)}>
                <option value="">{t("stock.allUnits")}</option>
                {scopedUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </div>
          </div>

          <article className="table-card stock-ledger-card">
            <header>
              <h3>{t("stock.ledgerTitle")}</h3>
              <small>{t("stock.filteredRecords", { count: movements.length })}</small>
            </header>

            {loadError && <p className="product-revenue-error">{loadError}</p>}

            <table className="data-table stock-ledger-table">
              <thead>
                <tr>
                  <th>{t("stock.date")}</th>
                  <th>{t("stock.product")}</th>
                  <th>{t("stock.movementType")}</th>
                  <th>{t("stock.quantityDelta")}</th>
                  <th>{t("stock.unitCost")}</th>
                  <th>{t("stock.note")}</th>
                  <th>{t("stock.recordedBy")}</th>
                </tr>
              </thead>
              <tbody>
                {!isLoadingMovements && movements.length === 0 && (
                  <tr><td colSpan={7}>{t("stock.noMovements")}</td></tr>
                )}
                {movements.map((movement) => {
                  const product = productOptions.find((item) => item.id === movement.productId);
                  return (
                    <tr key={movement.id}>
                      <td>{formatDateTime(movement.createdAt)}</td>
                      <td>{productLabel(product, movement.productId)}</td>
                      <td>{t(`stock.movementTypes.${movement.movementType}`)}</td>
                      <td className={movement.quantityDelta < 0 ? "stock-delta-negative" : "stock-delta-positive"}>
                        {movement.quantityDelta > 0 ? `+${movement.quantityDelta}` : movement.quantityDelta}
                      </td>
                      <td>{typeof movement.unitCost === "number" ? formatMoney(movement.unitCost, currencyFor(movement.businessId)) : "—"}</td>
                      <td>{movement.note || "—"}</td>
                      <td>{movement.createdByName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>
        </>
      )}
    </section>
  );
}
