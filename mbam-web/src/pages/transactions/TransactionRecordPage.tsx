import { useMemo, useState } from "react";
import { workspace } from "../../data/mockWorkspace";
import type { CustomerProfile } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";

type PaymentStatus = "paid" | "pending";

export default function TransactionRecordPage() {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [totalAmount, setTotalAmount] = useState("");
  const [outstandingAmount, setOutstandingAmount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);

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
              onChange={(event) => setTotalAmount(event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="items">Number of items</label>
            <input id="items" type="number" min="1" placeholder="1" />
          </div>

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
