import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loginWithEmail, requestPasswordReset } from "../../services/authService";
import type { AuthSession } from "../../types/auth";
import { Eye, EyeOff } from "./icons";

interface Props {
  onSwitch: () => void;
  onSuccess: (session: AuthSession) => void;
}

interface FormState {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export default function LoginForm({ onSwitch, onSuccess }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>({ email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.email.includes("@")) e.email = t("auth.validEmail");
    if (form.password.length < 1) e.password = t("auth.passwordRequired");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      const session = await loginWithEmail({
        email: form.email,
        password: form.password,
      });
      onSuccess(session);
    } catch {
      setErrors({ general: t("auth.signInError") });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!form.email.includes("@")) {
      setErrors({ email: t("auth.emailFirst") });
      return;
    }

    setResetLoading(true);
    setErrors({});
    try {
      await requestPasswordReset(form.email);
      setForgotSent(true);
    } catch {
      setErrors({ general: t("auth.resetError") });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errors.general && (
        <div className="alert alert-danger" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {errors.general}
        </div>
      )}

      {forgotSent && (
        <div className="alert alert-success" role="status">
          {t("auth.resetSaved")}
        </div>
      )}

      <div className="field-group">
        <div className="field">
          <label htmlFor="login-email">{t("auth.email")}</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={errors.email ? "error" : ""}
            aria-describedby={errors.email ? "login-email-err" : undefined}
          />
          {errors.email && (
            <span className="field-error" id="login-email-err" role="alert">
              {errors.email}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="login-password">{t("auth.password")}</label>
          <div className="password-wrap">
            <input
              id="login-password"
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              placeholder={t("auth.passwordPlaceholder")}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={errors.password ? "error" : ""}
              aria-describedby={errors.password ? "login-pass-err" : undefined}
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
          {errors.password && (
            <span className="field-error" id="login-pass-err" role="alert">
              {errors.password}
            </span>
          )}
          <button type="button" className="forgot-link" onClick={handleForgot} disabled={resetLoading}>
            {resetLoading ? t("auth.preparingReset") : t("auth.forgotPassword")}
          </button>
        </div>
      </div>

      <button type="submit" className="submit-btn" disabled={loading}>
        {loading && <span className="spinner" aria-hidden="true" />}
        {loading ? t("auth.signingIn") : t("auth.signIn")}
      </button>

      <div className="switch-mode">
        {t("auth.noAccount")} {" "}
        <button type="button" onClick={onSwitch}>
          {t("auth.createOne")}
        </button>
      </div>
    </form>
  );
}
