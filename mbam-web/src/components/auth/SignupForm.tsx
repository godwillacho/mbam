import { useState } from "react";
import { useTranslation } from "react-i18next";
import { resendVerification, signupWithEmail } from "../../services/authService";
import { Eye, EyeOff, MailCheck } from "./icons";

interface Props {
  onSwitch: () => void;
}

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  general?: string;
}

type Screen = "form" | "verify";
type StrengthLabel = "weak" | "fair" | "good" | "strong" | "";

function getStrength(pw: string): { score: number; labelKey: StrengthLabel; color: string } {
  if (pw.length === 0) return { score: 0, labelKey: "", color: "transparent" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 20, labelKey: "weak", color: "#DC2626" };
  if (score === 2) return { score: 40, labelKey: "fair", color: "#D97706" };
  if (score === 3) return { score: 65, labelKey: "good", color: "#2D9D78" };
  return { score: 100, labelKey: "strong", color: "#166534" };
}

export default function SignupForm({ onSwitch }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>({ fullName: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<Screen>("form");
  const [resent, setResent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const strength = getStrength(form.password);

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (form.fullName.trim().length < 2) e.fullName = t("auth.enterFullName");
    if (!form.email.includes("@")) e.email = t("auth.validEmail");
    if (form.password.length < 8) e.password = t("auth.minPassword");
    else if (!/[A-Z]/.test(form.password)) e.password = t("auth.uppercasePassword");
    else if (!/[0-9]/.test(form.password)) e.password = t("auth.numberPassword");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      await signupWithEmail({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      setScreen("verify");
    } catch {
      setErrors({ general: t("auth.signupError") });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await resendVerification(form.email);
      setResent(true);
      window.setTimeout(() => setResent(false), 5000);
    } catch {
      setErrors({ general: t("auth.resendError") });
    } finally {
      setResendLoading(false);
    }
  };

  if (screen === "verify") {
    return (
      <div className="verify-screen">
        <div className="verify-icon">
          <MailCheck size={28} color="var(--forest)" />
        </div>
        <h2 className="verify-title">{t("auth.checkInbox")}</h2>
        <p className="verify-body">
          {t("auth.verifyBody", { email: form.email })}
        </p>
        <p className="verify-body" style={{ fontSize: "12px" }}>
          {t("auth.localSaved")}
        </p>
        {resent && (
          <div className="alert alert-success" style={{ width: "100%" }} role="status">
            {t("auth.refreshed")}
          </div>
        )}
        <button className="resend-btn" type="button" onClick={handleResend} disabled={resendLoading}>
          {resendLoading ? t("auth.refreshing") : t("auth.resend")}
        </button>
        <div className="switch-mode" style={{ marginTop: 8 }}>
          {t("auth.alreadyVerified")} {" "}
          <button type="button" onClick={onSwitch}>
            {t("auth.signIn")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errors.general && (
        <div className="alert alert-danger" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {errors.general}
        </div>
      )}

      <div className="field-group">
        <div className="field">
          <label htmlFor="signup-name">{t("auth.fullName")}</label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            placeholder={t("auth.fullNamePlaceholder")}
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            className={errors.fullName ? "error" : ""}
          />
          {errors.fullName && <span className="field-error" role="alert">{errors.fullName}</span>}
        </div>

        <div className="field">
          <label htmlFor="signup-email">{t("auth.email")}</label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={errors.email ? "error" : ""}
          />
          {errors.email && <span className="field-error" role="alert">{errors.email}</span>}
        </div>

        <div className="field">
          <label htmlFor="signup-phone">
            {t("auth.phone")} {" "}
            <span className="field-hint">({t("auth.optional")})</span>
          </label>
          <input
            id="signup-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+237 6XX XXX XXX"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="signup-password">{t("auth.password")}</label>
          <div className="password-wrap">
            <input
              id="signup-password"
              type={showPass ? "text" : "password"}
              autoComplete="new-password"
              placeholder={t("auth.passwordCreatePlaceholder")}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={errors.password ? "error" : ""}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? t("auth.hidePassword") : t("auth.showPassword")}
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {form.password.length > 0 && (
            <>
              <div className="strength-bar">
                <div
                  className="strength-fill"
                  style={{ width: `${strength.score}%`, background: strength.color }}
                />
              </div>
              <span className="strength-label" style={{ color: strength.color }}>
                {strength.labelKey ? t(`auth.${strength.labelKey}`) : ""}
              </span>
            </>
          )}
          {errors.password && <span className="field-error" role="alert">{errors.password}</span>}
        </div>
      </div>

      <button type="submit" className="submit-btn" disabled={loading}>
        {loading && <span className="spinner" aria-hidden="true" />}
        {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
      </button>

      <p className="terms">
        {t("auth.terms")} {" "}
        <a href="/terms" target="_blank" rel="noreferrer">{t("auth.termsLink")}</a>{" "}
        {t("auth.and")} {" "}
        <a href="/privacy" target="_blank" rel="noreferrer">{t("auth.privacyLink")}</a>.
      </p>

      <div className="switch-mode">
        {t("auth.alreadyAccount")} {" "}
        <button type="button" onClick={onSwitch}>
          {t("auth.signIn")}
        </button>
      </div>
    </form>
  );
}
