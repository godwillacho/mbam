import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AuthMode } from "../../pages/auth/AuthPage";
import "./AuthLayout.css";

interface Props {
  children: ReactNode;
  mode: AuthMode;
}

export default function AuthLayout({ children, mode }: Props) {
  const { t } = useTranslation();

  return (
    <div className="auth-root">
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <div className="brand-mark">
            <span className="brand-logo">Mbam</span>
            <span className="brand-tagline">{t("auth.tagline")}</span>
          </div>
          <div className="brand-pattern" aria-hidden="true">
            {Array.from({ length: 48 }).map((_, i) => (
              <div key={i} className="pattern-dot" />
            ))}
          </div>
          <blockquote className="brand-quote">
            “{t("auth.quote")}”
          </blockquote>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div className="auth-mobile-logo">Mbam</div>

          <h1 className="auth-heading">
            {mode === "login" ? t("auth.welcomeBack") : t("auth.createAccountHeading")}
          </h1>
          <p className="auth-subheading">
            {mode === "login" ? t("auth.signInSubheading") : t("auth.signupSubheading")}
          </p>

          {children}
        </div>
      </div>
    </div>
  );
}
