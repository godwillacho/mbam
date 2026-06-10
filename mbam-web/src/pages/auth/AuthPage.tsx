import { useState } from "react";
import { useTranslation } from "react-i18next";
import LoginForm from "../../components/auth/LoginForm";
import SignupForm from "../../components/auth/SignupForm";
import SSOButtons from "../../components/auth/SSOButtons";
import AuthLayout from "../../components/auth/AuthLayout";
import type { AuthSession } from "../../types/auth";

export type AuthMode = "login" | "signup";

export default function AuthPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<AuthSession | null>(null);

  if (session) {
    return (
      <AuthLayout mode="login">
        <div className="verify-screen" role="status">
          <div className="verify-icon">✓</div>
          <h2 className="verify-title">{t("auth.signedInTitle")}</h2>
          <p className="verify-body">
            {t("auth.signedInBody", { name: session.user.fullName })}
          </p>
          <p className="verify-body" style={{ fontSize: "12px" }}>
            {t("auth.dashboardComing")}
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode={mode}>
      <SSOButtons mode={mode} onSuccess={setSession} />

      <div className="divider">
        <span>{t("auth.continueEmail")}</span>
      </div>

      {mode === "login" ? (
        <LoginForm onSwitch={() => setMode("signup")} onSuccess={setSession} />
      ) : (
        <SignupForm onSwitch={() => setMode("login")} />
      )}
    </AuthLayout>
  );
}
