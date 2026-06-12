import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LoginForm from "../../components/auth/LoginForm";
import SignupForm from "../../components/auth/SignupForm";
import SSOButtons from "../../components/auth/SSOButtons";
import AuthLayout from "../../components/auth/AuthLayout";
import {
  enableOfflineAccess,
  offlineAccessIsConfigured,
  refreshCloudSession,
  unlockOfflineSession,
} from "../../services/authService";
import type { AuthSession } from "../../types/auth";

export type AuthMode = "login" | "signup";

export default function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [offlineConfigured, setOfflineConfigured] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [offlineError, setOfflineError] = useState("");
  const [offlineBusy, setOfflineBusy] = useState(false);

  useEffect(() => {
    void offlineAccessIsConfigured().then(setOfflineConfigured);
    if (navigator.onLine) {
      void refreshCloudSession()
        .then(setSession)
        .catch(() => undefined);
    }
  }, []);

  const unlockOffline = async () => {
    setOfflineBusy(true);
    setOfflineError("");
    try {
      await unlockOfflineSession(passphrase);
      navigate("/dashboard", { replace: true });
    } catch {
      setOfflineError(t("auth.offlineUnlockError"));
    } finally {
      setOfflineBusy(false);
    }
  };

  const enableOffline = async () => {
    if (!session) return;
    setOfflineBusy(true);
    setOfflineError("");
    try {
      await enableOfflineAccess(session, passphrase);
      navigate("/dashboard", { replace: true });
    } catch {
      setOfflineError(t("auth.offlineSetupError"));
    } finally {
      setOfflineBusy(false);
    }
  };

  if (session) {
    return (
      <AuthLayout mode="login">
        <div className="verify-screen" role="status">
          <div className="verify-icon">✓</div>
          <h2 className="verify-title">{t("auth.signedInTitle")}</h2>
          <p className="verify-body">
            {t("auth.signedInBody", { name: session.user.fullName })}
          </p>
          {session.offlineGrant ? (
            <>
              <label className="field">
                <span>{t("auth.offlinePassphrase")}</span>
                <input
                  type="password"
                  value={passphrase}
                  minLength={10}
                  autoComplete="new-password"
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </label>
              {offlineError && (
                <div className="alert alert-danger">{offlineError}</div>
              )}
              <button
                type="button"
                className="submit-btn"
                disabled={offlineBusy || passphrase.length < 10}
                onClick={enableOffline}
              >
                {offlineBusy
                  ? t("auth.preparingOffline")
                  : offlineConfigured
                    ? t("auth.unlockAndUpdateOffline")
                    : t("auth.enableOffline")}
              </button>
            </>
          ) : (
            <p className="verify-body">{t("auth.offlineUnavailable")}</p>
          )}
          <button
            type="button"
            className="forgot-link"
            onClick={() => navigate("/dashboard", { replace: true })}
          >
            {t("auth.continueOnline")}
          </button>
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
        <>
          <LoginForm
            onSwitch={() => setMode("signup")}
            onSuccess={setSession}
          />
          {offlineConfigured && (
            <div className="field-group">
              <div className="field">
                <label htmlFor="offline-passphrase">
                  {t("auth.offlineUnlock")}
                </label>
                <input
                  id="offline-passphrase"
                  type="password"
                  minLength={10}
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
                <button
                  type="button"
                  className="forgot-link"
                  disabled={offlineBusy || passphrase.length < 10}
                  onClick={unlockOffline}
                >
                  {offlineBusy
                    ? t("auth.unlockingOffline")
                    : t("auth.unlockOffline")}
                </button>
                {offlineError && (
                  <span className="field-error">{offlineError}</span>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <SignupForm onSwitch={() => setMode("login")} />
      )}
    </AuthLayout>
  );
}
