import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout from "../../components/auth/AuthLayout";
import {
  getCurrentSession,
  offlineAccessIsConfigured,
  unlockOfflineSession,
} from "../../services/authService";
import {
  isKeycloakEnabled,
  loginWithKeycloak,
  recoverKeycloakAccount,
} from "../../services/keycloakService";
import { dashboardPickerPath, safeNextPath } from "./authRedirect";

export type AuthMode = "login" | "signup";

export default function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = getCurrentSession();
  const [offlineConfigured, setOfflineConfigured] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [offlineError, setOfflineError] = useState("");
  const [offlineBusy, setOfflineBusy] = useState(false);
  const requestedNextPath =
    searchParams.get("next") ??
    (typeof window === "undefined"
      ? null
      : sessionStorage.getItem("mbam-auth-next"));
  const nextPath = safeNextPath(requestedNextPath);

  useEffect(() => {
    void offlineAccessIsConfigured().then(setOfflineConfigured);
  }, []);

  useEffect(() => {
    if (session && nextPath) {
      navigate(dashboardPickerPath(nextPath), { replace: true });
    }
  }, [navigate, nextPath, session]);

  const unlockOffline = async () => {
    setOfflineBusy(true);
    setOfflineError("");
    try {
      await unlockOfflineSession(passphrase);
      navigate(dashboardPickerPath(nextPath), { replace: true });
    } catch {
      setOfflineError(t("auth.offlineUnlockError"));
    } finally {
      setOfflineBusy(false);
    }
  };

  if (isKeycloakEnabled() && session) {
    return <Navigate to={dashboardPickerPath(nextPath)} replace />;
  }

  if (session) {
    return <Navigate to={dashboardPickerPath(nextPath)} replace />;
  }

  return (
    <AuthLayout mode="login">
      <div className="verify-screen">
        <div className="verify-icon">M</div>
        <h2 className="verify-title">Sign in to Mbam</h2>
        <p className="verify-body">
          Keycloak securely manages credentials, account recovery, sessions,
          and multi-factor authentication.
        </p>
        <button
          className="submit-btn"
          onClick={() => void loginWithKeycloak()}
          type="button"
        >
          Continue to secure sign in
        </button>
        <button
          className="forgot-link"
          onClick={() => void recoverKeycloakAccount()}
          type="button"
        >
          Recover or update your account
        </button>
        {offlineConfigured && (
          <div className="field-group">
            <div className="field">
              <label htmlFor="offline-passphrase">
                {t("auth.offlineUnlock")}
              </label>
              <input
                id="offline-passphrase"
                minLength={10}
                onChange={(event) => setPassphrase(event.target.value)}
                type="password"
                value={passphrase}
              />
              <button
                className="forgot-link"
                disabled={offlineBusy || passphrase.length < 10}
                onClick={unlockOffline}
                type="button"
              >
                {offlineBusy ? t("auth.unlockingOffline") : t("auth.unlockOffline")}
              </button>
              {offlineError && (
                <span className="field-error">{offlineError}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
