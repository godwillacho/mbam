import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout from "../../components/auth/AuthLayout";
import { completePasswordReset } from "../../services/authService";
import {
  isKeycloakEnabled,
  recoverKeycloakAccount,
} from "../../services/keycloakService";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success">("idle");
  const [error, setError] = useState("");

  if (isKeycloakEnabled()) {
    return (
      <AuthLayout mode="login">
        <div className="verify-screen">
          <h1 className="verify-title">{t("auth.resetTitle")}</h1>
          <p className="verify-body">
            Account recovery now runs through Keycloak so password resets and
            verification updates stay in one identity system.
          </p>
          <button
            className="submit-btn"
            onClick={() => void recoverKeycloakAccount()}
            type="button"
          >
            Recover or update your account
          </button>
          <Link className="forgot-link" to="/auth">
            {t("auth.backToSignIn")}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError(t("auth.resetTokenMissing"));
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t("auth.minPassword"));
      return;
    }
    if (password !== confirmation) {
      setError(t("auth.resetPasswordMismatch"));
      return;
    }

    setStatus("saving");
    try {
      await completePasswordReset(token, password);
      setStatus("success");
    } catch {
      setError(t("auth.resetPasswordError"));
      setStatus("idle");
    }
  };

  return (
    <AuthLayout mode="login">
      <div className="verify-screen">
        <h1 className="verify-title">{t("auth.resetTitle")}</h1>
        <p className="verify-body">{t("auth.resetSubtitle")}</p>

        {status === "success" ? (
          <>
            <div className="alert alert-success" role="status">
              {t("auth.resetPasswordSuccess")}
            </div>
            <Link className="submit-btn" to="/auth">{t("auth.backToSignIn")}</Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate style={{ width: "100%" }}>
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            <div className="field-group">
              <div className="field">
                <label htmlFor="new-password">{t("auth.newPassword")}</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="confirm-password">{t("auth.confirmPassword")}</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
            </div>
            <button className="submit-btn" type="submit" disabled={status === "saving"}>
              {status === "saving" ? t("auth.updatingPassword") : t("auth.updatePassword")}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
