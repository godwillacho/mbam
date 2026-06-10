import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import type { CustomerProfile, ProductProfile } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./TransactionRecordPage.css";

type PaymentStatus = "paid" | "pending";

interface SaleLineItem {
  id: string;
  productId?: string;
  itemName: string;
  quantity: string;
  fixedPrice: string;
  priceSource?: "default" | "customer";
}

function createLineItem(): SaleLineItem {
  const fallbackId = `${Date.now()}-${Math.random()}`;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : fallbackId;

  return {
    id,
    itemName: "",
    quantity: "1",
    fixedPrice: "",
  };
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveProductPrice(product: ProductProfile, customerId?: string) {
  const customerPrice = customerId
    ? product.customerPrices?.find((price) => price.customerId === customerId)
    : undefined;

  return {
    price: customerPrice?.price ?? product.defaultPrice,
    source: customerPrice ? "customer" as const : "default" as const,
  };
}

export default function TransactionRecordPage() {
  const { t } = useTranslation();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [totalAmount, setTotalAmount] = useState("");
  const [outstandingAmount, setOutstandingAmount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [useItemizedDetails, setUseItemizedDetails] = useState(false);
  const [lineItems, setLineItems] = useState<SaleLineItem[]>(() => [createLineItem()]);

  const isPendingPayment = paymentStatus === "pending";
  const customerQuery = customerName.trim().toLowerCase();

  const customerSuggestions = useMemo(() => {
    if (customerQuery.length < 2 || selectedCustomer?.name.toLowerCase() === customerQuery) {
      return [];
    }

    return workspace.customers
      .filter((customer) =>
        customer.name.toLowerCase().includes(customerQuery) ||
        customer.contact?.toLowerCase().includes(customerQuery),
      )
      .slice(0, 4);
  }, [customerQuery, selectedCustomer]);

  const itemizedTotal = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.fixedPrice), 0);
  }, [lineItems]);

  useEffect(() => {
    if (useItemizedDetails) {
      setTotalAmount(itemizedTotal > 0 ? String(itemizedTotal) : "");
    }
  }, [itemizedTotal, useItemizedDetails]);

  const handleCustomerSelect = (customer: CustomerProfile) => {
    setSelectedCustomer(customer);
    setCustomerName(customer.name);
    setCustomerContact(customer.contact ?? "");
  };

  const handleCustomerNameChange = (value: string) => {
    setCustomerName(value);

    if (selectedCustomer && selectedCustomer.name !== value) {
      setSelectedCustomer(null);
    }
  };

  const updateLineItem = (id: string, field: keyof Omit<SaleLineItem, "id">, value: string) => {
    setLineItems((items) =>
      items.map((item) => (
        item.id === id
          ? {
              ...item,
              [field]: value,
              productId: field === "itemName" ? undefined : item.productId,
              priceSource: field === "itemName" ? undefined : item.priceSource,
            }
          : item
      )),
    );
  };

  const selectProductForLineItem = (lineItemId: string, product: ProductProfile) => {
    const resolvedPrice = resolveProductPrice(product, selectedCustomer?.id);

    setLineItems((items) =>
      items.map((item) =>
        item.id === lineItemId
          ? {
              ...item,
              productId: product.id,
              itemName: product.name,
              fixedPrice: String(resolvedPrice.price),
              priceSource: resolvedPrice.source,
            }
          : item,
      ),
    );
  };

  const productSuggestionsFor = (item: SaleLineItem) => {
    const query = item.itemName.trim().toLowerCase();

    if (query.length < 2 || item.productId) {
      return [];
    }

    return workspace.products
      .filter((product) =>
        product.name.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query),
      )
      .slice(0, 4);
  };

  const removeLineItem = (id: string) => {
    setLineItems((items) => (items.length === 1 ? items : items.filter((item) => item.id !== id)));
  };

  const handleItemizedToggle = (enabled: boolean) => {
    setUseItemizedDetails(enabled);

    if (!enabled) {
      setTotalAmount("");
    }
  };

  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("transactionRecord.eyebrow")}</span>
          <h2>{t("transactionRecord.title")}</h2>
          <p>{t("transactionRecord.description")}</p>
        </div>
      </div>

      <form className="form-card">
        <header>
          <h3>{t("transactionRecord.detailsTitle")}</h3>
          <small>{t("transactionRecord.detailsSubtitle")}</small>
        </header>

        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="business">{t("transactionRecord.business")}</label>
            <select id="business" defaultValue={workspace.businesses[0]?.id}>
              {workspace.businesses.map((business) => (
                <option key={business.id} value={business.id}>{business.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="unit">{t("transactionRecord.unit")}</label>
            <select id="unit" defaultValue={workspace.businessUnits[0]?.id}>
              {workspace.businessUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field customer-field">
            <label htmlFor="customer">{t("transactionRecord.customerName")}</label>
            <input
              id="customer"
              autoComplete="off"
              placeholder={t("transactionRecord.customerPlaceholder")}
              value={customerName}
              onChange={(event) => handleCustomerNameChange(event.target.value)}
            />

            {customerSuggestions.length > 0 && (
              <div className="customer-suggestions" role="listbox" aria-label={t("transactionRecord.customerSuggestions")}>
                {customerSuggestions.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="customer-suggestion"
                    onClick={() => handleCustomerSelect(customer)}
                  >
                    <span>
                      <strong>{customer.name}</strong>
                      <small>{customer.contact ?? t("transactionRecord.noContactSaved")}</small>
                    </span>
                    {customer.pendingBalance > 0 && (
                      <em>{formatMoney(customer.pendingBalance, workspace.masterAccount.currency)} {t("common.pending")}</em>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="customer-contact">{t("transactionRecord.customerContact")}</label>
            <input
              id="customer-contact"
              type="tel"
              placeholder={t("transactionRecord.customerContactPlaceholder")}
              value={customerContact}
              onChange={(event) => setCustomerContact(event.target.value)}
            />
            <span className="form-hint">{t("transactionRecord.newCustomerHint")}</span>
          </div>

          {selectedCustomer && (
            <div className={selectedCustomer.pendingBalance > 0 ? "customer-alert warning" : "customer-alert"}>
              <div>
                <strong>{selectedCustomer.name}</strong>
                <small>
                  {t("transactionRecord.lastPurchase")} {selectedCustomer.lastPurchaseAt ? formatDateTime(selectedCustomer.lastPurchaseAt) : t("transactionRecord.notRecorded")} · {t("transactionRecord.totalSpent")} {formatMoney(selectedCustomer.totalSpent, workspace.masterAccount.currency)}
                </small>
              </div>
              {selectedCustomer.pendingBalance > 0 ? (
                <span>{formatMoney(selectedCustomer.pendingBalance, workspace.masterAccount.currency)} {t("common.pending")}</span>
              ) : (
                <span>{t("transactionRecord.noPendingBalance")}</span>
              )}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="payment">{t("transactionRecord.paymentMethod")}</label>
            <select id="payment" defaultValue="cash">
              <option value="cash">{t("paymentMethods.cash")}</option>
              <option value="mobile_money">{t("paymentMethods.mobile_money")}</option>
              <option value="card">{t("paymentMethods.card")}</option>
              <option value="bank_transfer">{t("paymentMethods.bank_transfer")}</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="amount">{t("transactionRecord.totalAmount")}</label>
            <input
              id="amount"
              type="number"
              min="0"
              placeholder="0"
              value={totalAmount}
              readOnly={useItemizedDetails}
              onChange={(event) => setTotalAmount(event.target.value)}
            />
            {useItemizedDetails && (
              <span className="form-hint">{t("transactionRecord.autoFilledTotal")}</span>
            )}
          </div>

          <div className="form-field full itemized-toggle-card">
            <label className="itemized-toggle">
              <input
                type="checkbox"
                checked={useItemizedDetails}
                onChange={(event) => handleItemizedToggle(event.target.checked)}
              />
              <span>
                <strong>{t("transactionRecord.itemizedToggleTitle")}</strong>
                <small>{t("transactionRecord.itemizedToggleSubtitle")}</small>
              </span>
            </label>
          </div>

          {useItemizedDetails && (
            <section className="form-field full itemized-section" aria-label={t("transactionRecord.itemizedAria")}>
              <div className="itemized-header">
                <div>
                  <strong>{t("transactionRecord.itemizedTitle")}</strong>
                  <small>{t("transactionRecord.itemizedSubtitle")}</small>
                </div>
                <span>{formatMoney(itemizedTotal, workspace.masterAccount.currency)}</span>
              </div>

              <div className="itemized-table">
                <div className="itemized-row itemized-row-head">
                  <span>{t("transactionRecord.itemName")}</span>
                  <span>{t("transactionRecord.quantity")}</span>
                  <span>{t("transactionRecord.fixedPrice")}</span>
                  <span>{t("transactionRecord.amount")}</span>
                  <span aria-hidden="true" />
                </div>

                {lineItems.map((item) => {
                  const amount = toNumber(item.quantity) * toNumber(item.fixedPrice);
                  const productSuggestions = productSuggestionsFor(item);

                  return (
                    <div className="itemized-row" key={item.id}>
                      <div className="product-field">
                        <input
                          aria-label={t("transactionRecord.itemName")}
                          placeholder={t("transactionRecord.itemPlaceholder")}
                          value={item.itemName}
                          onChange={(event) => updateLineItem(item.id, "itemName", event.target.value)}
                        />

                        {productSuggestions.length > 0 && (
                          <div className="product-suggestions" role="listbox" aria-label={t("transactionRecord.productSuggestions")}>
                            {productSuggestions.map((product) => {
                              const resolvedPrice = resolveProductPrice(product, selectedCustomer?.id);

                              return (
                                <button
                                  key={product.id}
                                  type="button"
                                  className="product-suggestion"
                                  onClick={() => selectProductForLineItem(item.id, product)}
                                >
                                  <span>
                                    <strong>{product.name}</strong>
                                    <small>{t(`categories.${product.category}`)} · {product.sku ?? t("common.noSku")}</small>
                                  </span>
                                  <em>
                                    {formatMoney(resolvedPrice.price, workspace.masterAccount.currency)}
                                    {resolvedPrice.source === "customer" ? ` ${t("transactionRecord.customerPrice")}` : ""}
                                  </em>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {item.productId && (
                          <small className="learned-product-hint">
                            {t("transactionRecord.learnedProductSelected")} · {item.priceSource === "customer" ? t("transactionRecord.customerSpecificPriceApplied") : t("transactionRecord.defaultPriceApplied")}
                          </small>
                        )}
                      </div>
                      <input
                        aria-label={t("transactionRecord.quantity")}
                        type="number"
                        min="0"
                        placeholder="1"
                        value={item.quantity}
                        onChange={(event) => updateLineItem(item.id, "quantity", event.target.value)}
                      />
                      <input
                        aria-label={t("transactionRecord.fixedPrice")}
                        type="number"
                        min="0"
                        placeholder="0"
                        value={item.fixedPrice}
                        onChange={(event) => updateLineItem(item.id, "fixedPrice", event.target.value)}
                      />
                      <output>{formatMoney(amount, workspace.masterAccount.currency)}</output>
                      <button
                        type="button"
                        className="line-remove-btn"
                        disabled={lineItems.length === 1}
                        onClick={() => removeLineItem(item.id)}
                      >
                        {t("common.remove")}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="itemized-actions">
                <button type="button" className="secondary-btn" onClick={() => setLineItems((items) => [...items, createLineItem()])}>
                  {t("transactionRecord.addItem")}
                </button>
                <small>{t("transactionRecord.totalTransfers")}</small>
              </div>
            </section>
          )}

          <fieldset className="form-field full payment-status-field">
            <legend>{t("transactionRecord.paymentStatus")}</legend>
            <div className="payment-status-options">
              <label className={paymentStatus === "paid" ? "payment-option active" : "payment-option"}>
                <input
                  type="radio"
                  name="payment-status"
                  value="paid"
                  checked={paymentStatus === "paid"}
                  onChange={() => {
                    setPaymentStatus("paid");
                    setOutstandingAmount("");
                  }}
                />
                <span>
                  <strong>{t("transactionRecord.paid")}</strong>
                  <small>{t("transactionRecord.paidHint")}</small>
                </span>
              </label>

              <label className={paymentStatus === "pending" ? "payment-option active warning" : "payment-option"}>
                <input
                  type="radio"
                  name="payment-status"
                  value="pending"
                  checked={paymentStatus === "pending"}
                  onChange={() => setPaymentStatus("pending")}
                />
                <span>
                  <strong>{t("transactionRecord.pendingPayment")}</strong>
                  <small>{t("transactionRecord.pendingHint")}</small>
                </span>
              </label>
            </div>
          </fieldset>

          {isPendingPayment && (
            <div className="form-field full pending-payment-panel">
              <label htmlFor="outstanding-amount">{t("transactionRecord.outstandingAmount")}</label>
              <input
                id="outstanding-amount"
                type="number"
                min="0"
                max={totalAmount || undefined}
                placeholder={t("transactionRecord.outstandingPlaceholder")}
                value={outstandingAmount}
                onChange={(event) => setOutstandingAmount(event.target.value)}
              />
              <span className="form-hint">{t("transactionRecord.outstandingHint")}</span>
            </div>
          )}

          <div className="form-field full">
            <label htmlFor="note">{t("transactionRecord.note")}</label>
            <textarea id="note" placeholder={t("transactionRecord.notePlaceholder")} />
            <span className="form-hint">{t("transactionRecord.offlineHint")}</span>
          </div>
        </div>

        <div className="form-actions">
          <button className="secondary-btn" type="button">{t("transactionRecord.saveDraft")}</button>
          <button className="primary-btn" type="button">{t("transactionRecord.recordSale")}</button>
        </div>
      </form>
    </section>
  );
}
