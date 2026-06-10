import { useState } from "react";
import LoginForm from "../../components/auth/LoginForm";
import SignupForm from "../../components/auth/SignupForm";
import SSOButtons from "../../components/auth/SSOButtons";
import AuthLayout from "../../components/auth/AuthLayout";
import type { AuthSession } from "../../types/auth";

export type AuthMode = "login" | "signup";

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<AuthSession | null>(null);

  if (session) {
    return (
      <AuthLayout mode="login">
        <div className="verify-screen" role="status">
          <div className="verify-icon">✓</div>
          <h2 className="verify-title">Signed in successfully</h2>
          <p className="verify-body">
            Welcome, <strong>{session.user.fullName}</strong>. Your secure Mbam session is ready.
          </p>
          <p className="verify-body" style={{ fontSize: "12px" }}>
            The dashboard will connect here once the core workspace screens are added.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode={mode}>
      <SSOButtons mode={mode} onSuccess={setSession} />

      <div className="divider">
        <span>or continue with email</span>
      </div>

      {mode === "login" ? (
        <LoginForm onSwitch={() => setMode("signup")} onSuccess={setSession} />
      ) : (
        <SignupForm onSwitch={() => setMode("login")} />
      )}
    </AuthLayout>
  );
}
