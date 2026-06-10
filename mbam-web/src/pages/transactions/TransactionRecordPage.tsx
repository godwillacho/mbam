import { useEffect, useMemo, useState } from "react";
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
  return {
    id: window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
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
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [totalAmount, setTotalAmount] = useState("");
  const [outstandingAmount, setOutstandingAmount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [useItemizedDetails, setUseItemizedDetails] = useState(false);
  const [lineItems, setLineItems] = useState<SaleLineItem[]>([createLineItem]);

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
    return lineItems.reduce((sum, item) => {
      return sum + toNumber(item.quantity) * toNumber(item.fixedPrice);
    }, 0);
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
      items.map((item) => (item.id === id ? { ...item, [field]: value, productId: field === "itemName" ? undefined : item.productId, priceSource: field === "itemName" ? undefined : item.priceSource } : item)),
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
          <span className="eyebrow">Transaction record</span>
          <h2>Record a new sale</h2>
          <p>
            This form represents the offline-first sales entry flow. Later it will write to IndexedDB first, then sync to the Rust API when internet access is available.
          </p>
        </div>
      </div>

      <form className="form-card">
        <header>
          <h3>Sale details</h3>
          <small>Choose the business, shop, customer, payment method, payment status, and total amount.</small>
        </header>

        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="business">Business</label>
            <select id="business" defaultValue={workspace.businesses[0]?.id}>
              {workspace.businesses.map((business) => (
                <option key={business.id} value={business.id}>{business.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="unit">Shop or unit</label>
            <select id="unit" defaultValue={workspace.businessUnits[0]?.id}>
              {workspace.businessUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field customer-field">
            <label htmlFor="customer">Customer name</label>
            <input
              id="customer"
              autoComplete="off"
              placeholder="Search or enter new customer"
              value={customerName}
              onChange={(event) => handleCustomerNameChange(event.target.value)}
            />

            {customerSuggestions.length > 0 && (
              <div className="customer-suggestions" role="listbox" aria-label="Customer suggestions">
                {customerSuggestions.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="customer-suggestion"
                    onClick={() => handleCustomerSelect(customer)}
                  >
                    <span>
                      <strong>{customer.name}</strong>
                      <small>{customer.contact ?? "No contact saved"}</small>
                    </span>
                    {customer.pendingBalance > 0 && (
                      <em>{formatMoney(customer.pendingBalance, workspace.masterAccount.currency)} pending</em>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="customer-contact">Customer contact</label>
            <input
              id="customer-contact"
              type="tel"
              placeholder="Phone number or WhatsApp"
              value={customerContact}
              onChange={(event) => setCustomerContact(event.target.value)}
            />
            <span className="form-hint">New customers will be saved from this name and contact when the sale is recorded.</span>
          </div>

          {selectedCustomer && (
            <div className={selectedCustomer.pendingBalance > 0 ? "customer-alert warning" : "customer-alert"}>
              <div>
                <strong>{selectedCustomer.name}</strong>
                <small>
                  Last purchase {selectedCustomer.lastPurchaseAt ? formatDateTime(selectedCustomer.lastPurchaseAt) : "not recorded"} · Total spent {formatMoney(selectedCustomer.totalSpent, workspace.masterAccount.currency)}
                </small>
              </div>
              {selectedCustomer.pendingBalance > 0 ? (
                <span>{formatMoney(selectedCustomer.pendingBalance, workspace.masterAccount.currency)} pending</span>
              ) : (
                <span>No pending balance</span>
              )}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="payment">Payment method</label>
            <select id="payment" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile money</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="amount">Total amount</label>
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
              <span className="form-hint">Auto-filled from itemized transaction details.</span>
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
                <strong>Add itemized transaction details</strong>
                <small>Optional CSV-style section for multiple products with customer-specific prices.</small>
              </span>
            </label>
          </div>

          {useItemizedDetails && (
            <section className="form-field full itemized-section" aria-label="Itemized transaction details">
              <div className="itemized-header">
                <div>
                  <strong>Transaction details</strong>
                  <small>Enter each item, quantity, and fixed price. Learned products can auto-fill customer-specific prices.</small>
                </div>
                <span>{formatMoney(itemizedTotal, workspace.masterAccount.currency)}</span>
              </div>

              <div className="itemized-table">
                <div className="itemized-row itemized-row-head">
                  <span>Item name</span>
                  <span>Qty</span>
                  <span>Fixed price</span>
                  <span>Amount</span>
                  <span aria-hidden="true" />
                </div>

                {lineItems.map((item) => {
                  const amount = toNumber(item.quantity) * toNumber(item.fixedPrice);
                  const productSuggestions = productSuggestionsFor(item);

                  return (
                    <div className="itemized-row" key={item.id}>
                      <div className="product-field">
                        <input
                          aria-label="Item name"
                          placeholder="e.g. Rice bag"
                          value={item.itemName}
                          onChange={(event) => updateLineItem(item.id, "itemName", event.target.value)}
                        />

                        {productSuggestions.length > 0 && (
                          <div className="product-suggestions" role="listbox" aria-label="Product suggestions">
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
                                    <small>{product.category} · {product.sku ?? "No SKU"}</small>
                                  </span>
                                  <em>
                                    {formatMoney(resolvedPrice.price, workspace.masterAccount.currency)}
                                    {resolvedPrice.source === "customer" ? " customer price" : ""}
                                  </em>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {item.productId && (
                          <small className="learned-product-hint">
                            Learned product selected{item.priceSource === "customer" ? " · customer-specific price applied" : " · default price applied"}
                          </small>
                        )}
                      </div>
                      <input
                        aria-label="Quantity"
                        type="number"
                        min="0"
                        placeholder="1"
                        value={item.quantity}
                        onChange={(event) => updateLineItem(item.id, "quantity", event.target.value)}
                      />
                      <input
                        aria-label="Fixed price"
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
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="itemized-actions">
                <button type="button" className="secondary-btn" onClick={() => setLineItems((items) => [...items, createLineItem()])}>
                  Add item
                </button>
                <small>Total transfers automatically to the Total amount field.</small>
              </div>
            </section>
          )}

          <fieldset className="form-field full payment-status-field">
            <legend>Payment status</legend>
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
                  <strong>Paid</strong>
                  <small>The customer has completed payment for this sale.</small>
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
                  <strong>Pending payment</strong>
                  <small>The sale is recorded, but the customer still owes money.</small>
                </span>
              </label>
            </div>
          </fieldset>

          {isPendingPayment && (
            <div className="form-field full pending-payment-panel">
              <label htmlFor="outstanding-amount">Outstanding amount</label>
              <input
                id="outstanding-amount"
                type="number"
                min="0"
                max={totalAmount || undefined}
                placeholder="Amount still owed"
                value={outstandingAmount}
                onChange={(event) => setOutstandingAmount(event.target.value)}
              />
              <span className="form-hint">
                This amount will be saved with the transaction so the business can follow up on unpaid balances.
              </span>
            </div>
          )}

          <div className="form-field full">
            <label htmlFor="note">Transaction note</label>
            <textarea id="note" placeholder="Add optional note for this sale" />
            <span className="form-hint">The first implementation will queue this locally before backend sync.</span>
          </div>
        </div>

        <div className="form-actions">
          <button className="secondary-btn" type="button">Save draft</button>
          <button className="primary-btn" type="button">Record sale</button>
        </div>
      </form>
    </section>
  );
}
