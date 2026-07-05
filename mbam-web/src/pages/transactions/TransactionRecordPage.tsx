import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DevOnly from "../../components/app/DevOnly";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedUnits } from "../../security/accessControl";
import { listBusinesses, listBusinessUnits } from "../../services/businessService";
import { getCurrentSession } from "../../services/authService";
import { listBrowserDbCustomers, upsertBrowserDbCustomerFromTransaction } from "../../services/customers/customerBrowserDbService";
import { listProducts } from "../../services/productService";
import {
  createCloudTransaction,
  createTransactionDraft,
  deleteTransactionDraft,
  getTransactionDraft,
  updateTransactionDraft,
  type TransactionDraftInput,
} from "../../services/transactionService";
import { ApiClientError } from "../../services/apiClient";
import { isOfflineVaultUnlocked } from "../../services/offlineVaultService";
import { createLocalTransaction } from "../../services/transactions/transactionLocalRepository";
import type { CustomerProfile, PaymentMethod, ProductProfile } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { getProductDescriptor, getProductSearchText } from "../../utils/productDisplay";
import { calculatePendingAmount } from "../../utils/payment";
import { parsePositiveMoney, sanitizeText, validatePhone, validateSafeText, validateSaleLineInput } from "../../utils/validation";
import "./TransactionRecordPage.css";

type PaymentStatus = "paid" | "pending";

// Small inline icons for the record page's action buttons (Save
// draft/Record sale/Print invoice) -- no icon library is installed in this
// project, so these are plain, dependency-free SVGs sized by the global
// `.primary-btn svg`/`.secondary-btn svg` rule in AppShell.css. Purely
// decorative (each button already has a visible text label), so they're
// marked aria-hidden rather than announced to screen readers.
function SaveDraftIcon() {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function RecordSaleIcon() {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function PrintInvoiceIcon() {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

interface SaleLineItem {
  id: string;
  productId?: string;
  itemName: string;
  quantity: string;
  fixedPrice: string;
  priceSource?: "default" | "customer";
}

type FormErrors = Record<string, string>;

const allowedPaymentMethods: PaymentMethod[] = ["cash", "mobile_money", "card", "bank_transfer"];

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentMember = useMemo(() => getCurrentMember(), []);
  const session = getCurrentSession();
  const memberUnits = useMemo(
    () => getScopedUnits(currentMember),
    [currentMember],
  );
  const memberUnitIds = useMemo(() => new Set(memberUnits.map((unit) => unit.id)), [memberUnits]);
  const memberBusinessIds = useMemo(() => new Set(memberUnits.map((unit) => unit.businessId)), [memberUnits]);
  const initialBusinessId = currentMember.scopeLevel === "unit"
    ? memberUnits[0]?.businessId ?? ""
    : currentMember.businessId ?? searchParams.get("business") ?? workspace.businesses[0]?.id ?? "";
  const initialUnitId = currentMember.scopeLevel === "unit" ? memberUnits[0]?.id ?? "" : "";

  const [businessOptions, setBusinessOptions] = useState(workspace.businesses);
  const [unitOptions, setUnitOptions] = useState(workspace.businessUnits);
  const [productOptions, setProductOptions] = useState(workspace.products);
  const [businessId, setBusinessId] = useState(initialBusinessId);
  const [unitId, setUnitId] = useState(initialUnitId);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [totalAmount, setTotalAmount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [note, setNote] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [customerOptions, setCustomerOptions] = useState<CustomerProfile[]>([]);
  const [useItemizedDetails, setUseItemizedDetails] = useState(false);
  const [lineItems, setLineItems] = useState<SaleLineItem[]>(() => [createLineItem()]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formStatus, setFormStatus] = useState<"idle" | "saving" | "validated">("idle");
  const draftId = searchParams.get("draft");

  const isPendingPayment = paymentStatus === "pending";
  const customerQuery = customerName.trim().toLowerCase();

  const scopedBusinessOptions = useMemo(() => businessOptions.filter((business) => {
    if (currentMember.scopeLevel === "master") return true;
    if (currentMember.scopeLevel === "business") return business.id === currentMember.businessId;
    return memberBusinessIds.has(business.id);
  }), [businessOptions, currentMember.businessId, currentMember.scopeLevel, memberBusinessIds]);

  const selectedBusinessUnits = useMemo(
    () => unitOptions.filter((unit) => {
      if (unit.businessId !== businessId || unit.status !== "active") return false;
      if (currentMember.scopeLevel === "master" || currentMember.scopeLevel === "business") return true;
      return memberUnitIds.has(unit.id);
    }),
    [businessId, currentMember.scopeLevel, memberUnitIds, unitOptions],
  );

  const selectedBusiness = scopedBusinessOptions.find((business) => business.id === businessId);
  const selectedUnit = selectedBusinessUnits.find((unit) => unit.id === unitId);
  const canChooseBusiness = currentMember.scopeLevel === "master";
  const canChooseUnit = selectedBusinessUnits.length > 1 && (currentMember.scopeLevel === "master" || currentMember.scopeLevel === "business");
  const scopedProductOptions = useMemo(
    () => productOptions.filter((product) => {
      if (product.businessUnitId) return product.businessUnitId === unitId;
      return !product.businessId || product.businessId === businessId;
    }),
    [businessId, productOptions, unitId],
  );

  useEffect(() => {
    if (currentMember.scopeLevel === "unit" && memberUnits[0]) {
      setBusinessId(memberUnits[0].businessId);
      setUnitId(memberUnits[0].id);
      return;
    }

    if (currentMember.scopeLevel === "business" && currentMember.businessId) {
      setBusinessId(currentMember.businessId);
    }
  }, [currentMember.businessId, currentMember.scopeLevel, memberUnits]);

  useEffect(() => {
    if (selectedBusinessUnits.length > 0 && !selectedBusinessUnits.some((unit) => unit.id === unitId)) {
      setUnitId(selectedBusinessUnits[0].id);
    }
  }, [selectedBusinessUnits, unitId]);

  useEffect(() => {
    let ignore = false;

    async function loadCustomers() {
      const customers = await listBrowserDbCustomers(currentMember);
      if (!ignore) setCustomerOptions(customers);
    }

    void loadCustomers();

    return () => {
      ignore = true;
    };
  }, [currentMember]);

  useEffect(() => {
    let active = true;
    Promise.all([listBusinesses(), listProducts(workspace.products)])
      .then(async ([businesses, catalogue]) => {
        const units = (await Promise.all(businesses.map((business) => listBusinessUnits(business.id)))).flat();
        if (!active) return;
        setBusinessOptions(businesses);
        setUnitOptions(units);
        setProductOptions(catalogue.products);
        setBusinessId((current) => current || initialBusinessId || businesses[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialBusinessId]);

  useEffect(() => {
    if (!draftId) return;
    let active = true;
    getTransactionDraft(draftId)
      .then((draft) => {
        if (!active) return;
        if (currentMember.scopeLevel === "master" || currentMember.scopeLevel === "business") {
          setBusinessId(draft.businessId ?? "");
          setUnitId(draft.businessUnitId ?? "");
        }
        setCustomerName(draft.customerName ?? "");
        setCustomerContact(draft.customerContact ?? "");
        setPaymentMethod(draft.paymentMethod ?? "cash");
        setPaymentStatus(draft.paymentStatus ?? "paid");
        setTotalAmount(draft.totalAmount ? String(draft.totalAmount) : "");
        setAmountPaid(draft.amountPaid !== undefined ? String(draft.amountPaid) : "");
        setNote(draft.note ?? "");
        setUseItemizedDetails(Boolean(draft.useItemizedDetails));
        if (draft.lines.length > 0) {
          setLineItems(draft.lines.map((line) => ({
            id: createLineItem().id,
            productId: line.productId,
            itemName: line.productName,
            quantity: String(line.quantity),
            fixedPrice: String(line.unitPrice),
          })));
        }
      })
      .catch((loadError: unknown) => {
        if (active) setErrors({ submit: loadError instanceof Error ? loadError.message : t("drafts.loadError") });
      });
    return () => {
      active = false;
    };
  }, [currentMember.scopeLevel, draftId, t]);

  const customerSuggestions = useMemo(() => {
    if (customerQuery.length < 2 || selectedCustomer?.name.toLowerCase() === customerQuery) {
      return [];
    }

    return customerOptions
      .filter((customer) => !customer.businessId || customer.businessId === businessId)
      .filter((customer) =>
        customer.name.toLowerCase().includes(customerQuery) ||
        customer.contact?.toLowerCase().includes(customerQuery),
      )
      .slice(0, 4);
  }, [businessId, customerOptions, customerQuery, selectedCustomer]);

  const itemizedTotal = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.fixedPrice), 0);
  }, [lineItems]);

  useEffect(() => {
    if (useItemizedDetails) {
      setTotalAmount(itemizedTotal > 0 ? String(itemizedTotal) : "");
    }
  }, [itemizedTotal, useItemizedDetails]);

  const validateForm = (): FormErrors => {
    const nextErrors: FormErrors = {};
    const normalizedCustomerName = sanitizeText(customerName, 80);
    const normalizedCustomerContact = sanitizeText(customerContact, 24);
    const normalizedNote = sanitizeText(note, 240);
    const parsedTotal = parsePositiveMoney(totalAmount);
    const parsedAmountPaid = amountPaid.trim() === "" ? null : Number(amountPaid);

    if (!selectedBusiness) nextErrors.business = t("transactionRecord.validation.businessRequired");
    if (!selectedUnit || selectedUnit.businessId !== businessId) {
      nextErrors.unit = t("transactionRecord.validation.unitRequired");
    }
    if (!validateSafeText(normalizedCustomerName, 80)) nextErrors.customerName = t("transactionRecord.validation.customerNameRequired");
    if (!validatePhone(normalizedCustomerContact)) nextErrors.customerContact = t("transactionRecord.validation.customerContactInvalid");
    if (!allowedPaymentMethods.includes(paymentMethod)) nextErrors.paymentMethod = t("transactionRecord.validation.paymentMethodInvalid");
    if (parsedTotal === null || parsedTotal <= 0) nextErrors.totalAmount = t("transactionRecord.validation.totalAmountInvalid");
    if (normalizedNote.length > 240) nextErrors.note = t("transactionRecord.validation.noteTooLong");

    if (isPendingPayment) {
      if (parsedAmountPaid === null || !Number.isFinite(parsedAmountPaid) || parsedAmountPaid < 0) {
        nextErrors.amountPaid = t("transactionRecord.validation.amountPaidInvalid");
      } else if (parsedTotal !== null && parsedAmountPaid >= parsedTotal) {
        nextErrors.amountPaid = t("transactionRecord.validation.amountPaidTooHigh");
      }
    }

    if (useItemizedDetails) {
      lineItems.forEach((item, index) => {
        const lineValidation = validateSaleLineInput(item);
        if (!lineValidation.ok) {
          nextErrors[`line-${item.id}`] = t("transactionRecord.validation.lineItemInvalid", { index: index + 1 });
        }
      });
    }

    return nextErrors;
  };

  const parsedTotalAmount = parsePositiveMoney(totalAmount) ?? 0;
  const parsedAmountPaid = isPendingPayment
    ? amountPaid.trim() === "" ? 0 : Number(amountPaid)
    : parsedTotalAmount;
  const pendingAmount = isPendingPayment
    ? calculatePendingAmount(parsedTotalAmount, parsedAmountPaid)
    : 0;

  const transactionLines = () => useItemizedDetails
    ? lineItems.map((item) => {
        const product = item.productId ? scopedProductOptions.find((candidate) => candidate.id === item.productId) : undefined;
        return {
          productId: item.productId,
          productName: sanitizeText(item.itemName, 100),
          sku: product?.sku,
          quantity: toNumber(item.quantity),
          unitPrice: toNumber(item.fixedPrice),
        };
      })
    : parsedTotalAmount > 0
      ? [{ productName: t("invoice.transactionTotal"), quantity: 1, unitPrice: parsedTotalAmount }]
      : [];

  const draftPayload = (): TransactionDraftInput => ({
    businessId: businessId || undefined,
    businessUnitId: unitId || undefined,
    customerName: sanitizeText(customerName, 80) || undefined,
    customerContact: sanitizeText(customerContact, 24) || undefined,
    paymentMethod,
    paymentStatus,
    totalAmount: parsedTotalAmount || undefined,
    amountPaid: isPendingPayment && amountPaid.trim() !== "" ? Number(amountPaid) : undefined,
    note: sanitizeText(note, 240) || undefined,
    useItemizedDetails,
    lines: transactionLines(),
  });

  const handleSaveDraft = async () => {
    setFormStatus("saving");
    setErrors({});
    try {
      if (draftId) {
        await updateTransactionDraft(draftId, draftPayload());
      } else {
        await createTransactionDraft(draftPayload());
      }
      navigate("/transactions/drafts");
    } catch (saveError) {
      setFormStatus("idle");
      setErrors({ submit: saveError instanceof Error ? saveError.message : t("drafts.loadError") });
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldPrintReceipt = submitter?.dataset.intent === "print";
    const nextErrors = validateForm();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setFormStatus("idle");
      return;
    }

    setFormStatus("saving");

    try {
      const lines = transactionLines();

      const idempotencyKey = crypto.randomUUID();
      try {
        const saved = await createCloudTransaction({
          businessId,
          businessUnitId: unitId,
          customerName: sanitizeText(customerName, 80),
          customerContact: sanitizeText(customerContact, 24) || undefined,
          paymentMethod,
          paymentStatus,
          outstandingAmount: pendingAmount,
          idempotencyKey,
          lines,
        });
        if (draftId) await deleteTransactionDraft(draftId).catch(() => undefined);
        setFormStatus("validated");
        navigate(`/transactions/${saved.id}/invoice${shouldPrintReceipt ? "?print=1" : ""}`);
      } catch (cloudError) {
        if (
          cloudError instanceof ApiClientError &&
          cloudError.status >= 400 &&
          cloudError.status < 500
        ) {
          throw cloudError;
        }
        if (!isOfflineVaultUnlocked()) {
          throw cloudError;
        }
        const savedCustomer = await upsertBrowserDbCustomerFromTransaction({
          existingCustomerId: selectedCustomer?.id,
          name: sanitizeText(customerName, 80),
          contact: sanitizeText(customerContact, 24),
          businessId,
          businessUnitId: unitId,
          member: currentMember,
        });
        const saved = await createLocalTransaction({
          businessId,
          businessUnitId: unitId,
          customerId: savedCustomer.id,
          customerName: savedCustomer.name,
          customerContact: savedCustomer.contact,
          paymentMethod,
          paymentStatus,
          outstandingAmount: pendingAmount,
          recordedBy: session?.user.fullName ?? currentMember.fullName,
          recordedByUserId: session?.user.id ?? currentMember.id,
          status: "queued",
          syncStatus: "queued",
          lines,
        });
        if (draftId) await deleteTransactionDraft(draftId).catch(() => undefined);
        setFormStatus("validated");
        navigate(`/transactions/${saved.transaction.localId}/invoice${shouldPrintReceipt ? "?print=1" : ""}`);
      }
    } catch (saveError) {
      setFormStatus("idle");
      setErrors({ submit: saveError instanceof Error ? saveError.message : t("transactionRecord.validation.summaryTitle") });
    }
  };

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

    return scopedProductOptions
      .filter((product) => getProductSearchText(product).includes(query))
      .slice(0, 6);
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
          <DevOnly><p>{t("transactionRecord.description")}</p></DevOnly>
        </div>
      </div>

      <form className="form-card" noValidate onSubmit={handleSubmit}>
        <header>
          <h3>{t("transactionRecord.detailsTitle")}</h3>
          <DevOnly><small>{t("transactionRecord.detailsSubtitle")}</small></DevOnly>
        </header>

        {Object.keys(errors).length > 0 && (
          <div className="validation-summary" role="alert">
            <strong>{t("transactionRecord.validation.summaryTitle")}</strong>
            <ul>
              {Object.entries(errors).map(([field, message]) => <li key={field}>{message}</li>)}
            </ul>
          </div>
        )}

        {formStatus === "validated" && (
          <div className="validation-success" role="status">
            {t("transactionRecord.validation.validated")}
          </div>
        )}

        <div className="form-grid">
          {canChooseBusiness ? (
            <div className="form-field">
              <label htmlFor="business">{t("transactionRecord.business")}</label>
              <select id="business" value={businessId} onChange={(event) => {
                setBusinessId(event.target.value);
                setUnitId("");
              }}>
                {scopedBusinessOptions.map((business) => (
                  <option key={business.id} value={business.id}>{business.name}</option>
                ))}
              </select>
              {errors.business && <span className="field-error">{errors.business}</span>}
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="business">{t("transactionRecord.business")}</label>
              <input id="business" value={selectedBusiness?.name ?? ""} readOnly />
              {errors.business && <span className="field-error">{errors.business}</span>}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="unit">{t("transactionRecord.unit")}</label>
            {canChooseUnit ? (
              <select id="unit" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                {selectedBusinessUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            ) : (
              <input id="unit" value={selectedUnit?.name ?? ""} readOnly />
            )}
            {errors.unit && <span className="field-error">{errors.unit}</span>}
          </div>

          <div className="form-field customer-field">
            <label htmlFor="customer">{t("transactionRecord.customerName")}</label>
            <input id="customer" autoComplete="off" maxLength={80} placeholder={t("transactionRecord.customerPlaceholder")} value={customerName} onChange={(event) => handleCustomerNameChange(event.target.value)} />
            {errors.customerName && <span className="field-error">{errors.customerName}</span>}

            {customerSuggestions.length > 0 && (
              <div className="customer-suggestions" role="listbox" aria-label={t("transactionRecord.customerSuggestions")}>
                {customerSuggestions.map((customer) => (
                  <button key={customer.id} type="button" className="customer-suggestion" onClick={() => handleCustomerSelect(customer)}>
                    <span>
                      <strong>{customer.name}</strong>
                      <small>{customer.contact ?? t("transactionRecord.noContactSaved")}</small>
                    </span>
                    {customer.pendingBalance > 0 && <em>{formatMoney(customer.pendingBalance, selectedBusiness?.currency ?? workspace.masterAccount.currency)} {t("common.pending")}</em>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="customer-contact">{t("transactionRecord.customerContact")}</label>
            <input id="customer-contact" type="tel" maxLength={24} placeholder={t("transactionRecord.customerContactPlaceholder")} value={customerContact} onChange={(event) => setCustomerContact(event.target.value)} />
            {errors.customerContact ? <span className="field-error">{errors.customerContact}</span> : <DevOnly><span className="form-hint">{t("transactionRecord.newCustomerHint")}</span></DevOnly>}
          </div>

          {selectedCustomer && (
            <div className={selectedCustomer.pendingBalance > 0 ? "customer-alert warning" : "customer-alert"}>
              <div>
                <strong>{selectedCustomer.name}</strong>
                <small>{t("transactionRecord.lastPurchase")} {selectedCustomer.lastPurchaseAt ? formatDateTime(selectedCustomer.lastPurchaseAt) : t("transactionRecord.notRecorded")} · {t("transactionRecord.totalSpent")} {formatMoney(selectedCustomer.totalSpent, selectedBusiness?.currency ?? workspace.masterAccount.currency)}</small>
              </div>
              {selectedCustomer.pendingBalance > 0 ? <span>{formatMoney(selectedCustomer.pendingBalance, selectedBusiness?.currency ?? workspace.masterAccount.currency)} {t("common.pending")}</span> : <span>{t("transactionRecord.noPendingBalance")}</span>}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="payment">{t("transactionRecord.paymentMethod")}</label>
            <select id="payment" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
              <option value="cash">{t("paymentMethods.cash")}</option>
              <option value="mobile_money">{t("paymentMethods.mobile_money")}</option>
              <option value="card">{t("paymentMethods.card")}</option>
              <option value="bank_transfer">{t("paymentMethods.bank_transfer")}</option>
            </select>
            {errors.paymentMethod && <span className="field-error">{errors.paymentMethod}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="amount">{t("transactionRecord.totalAmount")}</label>
            <input id="amount" type="number" min="0" max="100000000" placeholder="0" value={totalAmount} readOnly={useItemizedDetails} onChange={(event) => setTotalAmount(event.target.value)} />
            {errors.totalAmount ? <span className="field-error">{errors.totalAmount}</span> : useItemizedDetails && <DevOnly><span className="form-hint">{t("transactionRecord.autoFilledTotal")}</span></DevOnly>}
          </div>

          <div className="form-field full itemized-toggle-card">
            <label className="itemized-toggle">
              <input type="checkbox" checked={useItemizedDetails} onChange={(event) => handleItemizedToggle(event.target.checked)} />
              <span>
                <strong>{t("transactionRecord.itemizedToggleTitle")}</strong>
                <DevOnly><small>{t("transactionRecord.itemizedToggleSubtitle")}</small></DevOnly>
              </span>
            </label>
          </div>

          {useItemizedDetails && (
            <section className="form-field full itemized-section" aria-label={t("transactionRecord.itemizedAria")}>
              <div className="itemized-header">
                <div>
                  <strong>{t("transactionRecord.itemizedTitle")}</strong>
                  <DevOnly><small>{t("transactionRecord.itemizedSubtitle")}</small></DevOnly>
                </div>
                <span>{formatMoney(itemizedTotal, selectedBusiness?.currency ?? workspace.masterAccount.currency)}</span>
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
                        <input aria-label={t("transactionRecord.itemName")} maxLength={100} placeholder={t("transactionRecord.itemPlaceholder")} value={item.itemName} onChange={(event) => updateLineItem(item.id, "itemName", event.target.value)} />

                        {productSuggestions.length > 0 && (
                          <div className="product-suggestions" role="listbox" aria-label={t("transactionRecord.productSuggestions")}>
                            {productSuggestions.map((product) => {
                              const resolvedPrice = resolveProductPrice(product, selectedCustomer?.id);
                              const descriptor = getProductDescriptor(product);
                              return (
                                <button key={product.id} type="button" className="product-suggestion" onClick={() => selectProductForLineItem(item.id, product)}>
                                  <span>
                                    <strong>{product.name}</strong>
                                    <small>{descriptor || t(`categories.${product.category}`)}</small>
                                    <small>{product.sku ?? t("common.noSku")} · {t(`categories.${product.category}`)}</small>
                                  </span>
                                  <em>{formatMoney(resolvedPrice.price, selectedBusiness?.currency ?? workspace.masterAccount.currency)}{resolvedPrice.source === "customer" ? ` ${t("transactionRecord.customerPrice")}` : ""}</em>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {item.productId && <DevOnly><small className="learned-product-hint">{t("transactionRecord.learnedProductSelected")} · {item.priceSource === "customer" ? t("transactionRecord.customerSpecificPriceApplied") : t("transactionRecord.defaultPriceApplied")}</small></DevOnly>}
                        {errors[`line-${item.id}`] && <span className="field-error">{errors[`line-${item.id}`]}</span>}
                      </div>
                      <input aria-label={t("transactionRecord.quantity")} type="number" min="0.001" max="10000" placeholder="1" value={item.quantity} onChange={(event) => updateLineItem(item.id, "quantity", event.target.value)} />
                      <input aria-label={t("transactionRecord.fixedPrice")} type="number" min="0" max="100000000" placeholder="0" value={item.fixedPrice} onChange={(event) => updateLineItem(item.id, "fixedPrice", event.target.value)} />
                      <output>{formatMoney(amount, selectedBusiness?.currency ?? workspace.masterAccount.currency)}</output>
                      <button type="button" className="line-remove-btn" disabled={lineItems.length === 1} onClick={() => removeLineItem(item.id)}>{t("common.remove")}</button>
                    </div>
                  );
                })}
              </div>

              <div className="itemized-actions">
                <button type="button" className="secondary-btn" onClick={() => setLineItems((items) => [...items, createLineItem()])}>{t("transactionRecord.addItem")}</button>
                <DevOnly><small>{t("transactionRecord.totalTransfers")}</small></DevOnly>
              </div>
            </section>
          )}

          <div className="form-field full payment-status-field">
            <label htmlFor="payment-status">{t("transactionRecord.paymentStatus")}</label>
            <select
              id="payment-status"
              value={paymentStatus}
              onChange={(event) => {
                const status = event.target.value as PaymentStatus;
                setPaymentStatus(status);
                if (status === "paid") setAmountPaid("");
              }}
            >
              <option value="paid">{t("transactionRecord.paid")}</option>
              <option value="pending">{t("transactionRecord.pendingPayment")}</option>
            </select>
          </div>

          {isPendingPayment && (
            <div className="form-field full pending-payment-panel pending-payment-grid">
              <div>
                <label htmlFor="amount-paid">{t("transactionRecord.amountPaid")}</label>
                <input id="amount-paid" type="number" min="0" max={totalAmount || undefined} placeholder={t("transactionRecord.amountPaidPlaceholder")} value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} />
                {errors.amountPaid && <span className="field-error">{errors.amountPaid}</span>}
              </div>
              <div className="calculated-pending-amount">
                <span>{t("transactionRecord.pendingAmount")}</span>
                <strong>{formatMoney(pendingAmount, selectedBusiness?.currency ?? workspace.masterAccount.currency)}</strong>
              </div>
            </div>
          )}

          <div className="form-field full">
            <label htmlFor="note">{t("transactionRecord.note")}</label>
            <textarea id="note" maxLength={240} placeholder={t("transactionRecord.notePlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} />
            {errors.note ? <span className="field-error">{errors.note}</span> : <DevOnly><span className="form-hint">{t("transactionRecord.offlineHint")}</span></DevOnly>}
          </div>
        </div>

        <div className="form-actions">
          <button className="secondary-btn" type="button" disabled={formStatus === "saving"} onClick={() => void handleSaveDraft()}>
            <SaveDraftIcon />
            <span>{t("transactionRecord.saveDraft")}</span>
          </button>
          {/*
            Deliberately NOT gated on form validity (only on formStatus ===
            "saving", to prevent a double-submit): these used to also
            disable whenever `validateForm()` found anything incomplete,
            including on the very first render before the user had typed
            anything. Since a disabled button never fires a click, that
            meant `handleSubmit`'s own `setErrors(nextErrors)` -- which
            drives the validation-summary panel above -- could never run,
            leaving both buttons permanently greyed out with no way for the
            user to see what was missing. Clicking now always runs
            validation and either shows the specific errors or proceeds.
          */}
          <button className="primary-btn record-sale-btn" type="submit" disabled={formStatus === "saving"}>
            <RecordSaleIcon />
            <span>{t("transactionRecord.recordSale")}</span>
          </button>
          <button className="primary-btn" type="submit" data-intent="print" disabled={formStatus === "saving"}>
            <PrintInvoiceIcon />
            <span>{t("invoice.printInvoice")}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
