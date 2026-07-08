import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DevOnly from "../../components/app/DevOnly";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedUnits } from "../../routing/accessControl";
import { listProducts } from "../../services/products/productService";
import {
  listStockMovements,
  MANUAL_STOCK_MOVEMENT_TYPES,
  recordStockMovement,
  type ManualStockMovementType,
  type StockMovement,
} from "../../services/stock/stockService";
import type { ProductProfile } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
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
    <section className="page-grid stock-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("stock.eyebrow")}</span>
          <h2>{t("stock.title")}</h2>
          <DevOnly><p>{t("stock.description")}</p></DevOnly>
        </div>
      </div>

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
