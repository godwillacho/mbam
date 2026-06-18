export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s().-]{7,20}$/;
const SAFE_TEXT_RE = /^[\p{L}\p{N}\s.,'’@()+\-_/&:]+$/u;

export function sanitizeText(value: string, maxLength = 120): string {
  return value
    .normalize("NFKC")
    .replace(/[<>`{}$\\]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function validateEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function validatePhone(value?: string): boolean {
  if (!value) return true;
  const phone = sanitizeText(value, 24);
  return PHONE_RE.test(phone);
}

export function validateSafeText(value: string, maxLength = 120): boolean {
  const text = sanitizeText(value, maxLength);
  return text.length > 0 && SAFE_TEXT_RE.test(text);
}

function validatePassword(value: string): boolean {
  return value.length >= 8 && value.length <= 128 && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

export function parsePositiveMoney(value: string, max = 100_000_000): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return Math.round(parsed * 100) / 100;
}

function parsePositiveQuantity(value: string, max = 10_000): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) return null;
  return Math.round(parsed * 1000) / 1000;
}

export interface AuthLoginInput {
  email: string;
  password: string;
}

export interface AuthSignupInput extends AuthLoginInput {
  fullName: string;
  phone?: string;
}

export function validateLoginInput(input: AuthLoginInput): ValidationResult<AuthLoginInput> {
  const errors: Record<string, string> = {};
  const email = normalizeEmail(input.email);

  if (!validateEmail(email)) errors.email = "invalid_email";
  if (!input.password || input.password.length > 128) errors.password = "invalid_password";

  return {
    ok: Object.keys(errors).length === 0,
    value: Object.keys(errors).length === 0 ? { email, password: input.password } : undefined,
    errors,
  };
}

export function validateSignupInput(input: AuthSignupInput): ValidationResult<AuthSignupInput> {
  const errors: Record<string, string> = {};
  const email = normalizeEmail(input.email);
  const fullName = sanitizeText(input.fullName, 80);
  const phone = input.phone ? sanitizeText(input.phone, 24) : undefined;

  if (!validateSafeText(fullName, 80)) errors.fullName = "invalid_name";
  if (!validateEmail(email)) errors.email = "invalid_email";
  if (!validatePhone(phone)) errors.phone = "invalid_phone";
  if (!validatePassword(input.password)) errors.password = "weak_password";

  return {
    ok: Object.keys(errors).length === 0,
    value: Object.keys(errors).length === 0 ? { fullName, email, phone, password: input.password } : undefined,
    errors,
  };
}

export interface SaleLineInput {
  itemName: string;
  quantity: string;
  fixedPrice: string;
}

export function validateSaleLineInput(input: SaleLineInput): ValidationResult<{
  itemName: string;
  quantity: number;
  fixedPrice: number;
}> {
  const errors: Record<string, string> = {};
  const itemName = sanitizeText(input.itemName, 100);
  const quantity = parsePositiveQuantity(input.quantity);
  const fixedPrice = parsePositiveMoney(input.fixedPrice);

  if (!validateSafeText(itemName, 100)) errors.itemName = "invalid_item_name";
  if (quantity === null) errors.quantity = "invalid_quantity";
  if (fixedPrice === null) errors.fixedPrice = "invalid_price";

  return {
    ok: Object.keys(errors).length === 0,
    value: Object.keys(errors).length === 0 && quantity !== null && fixedPrice !== null
      ? { itemName, quantity, fixedPrice }
      : undefined,
    errors,
  };
}
