import { useState } from "react";
import LoginForm from "../../components/auth/LoginForm";
import SignupForm from "../../components/auth/SignupForm";
import SSOButtons from "../../components/auth/SSOButtons";
import AuthLayout from "../../components/auth/AuthLayout";

export type AuthMode = "login" | "signup";

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");

  return (
    <AuthLayout mode={mode}>
      <SSOButtons mode={mode} />

      <div className="divider">
        <span>or continue with email</span>
      </div>

      {mode === "login" ? (
        <LoginForm onSwitch={() => setMode("signup")} />
      ) : (
        <SignupForm onSwitch={() => setMode("login")} />
      )}
    </AuthLayout>
  );
}
