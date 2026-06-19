import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LoginForm from "../../components/auth/LoginForm";
import SignupForm from "../../components/auth/SignupForm";
import SSOButtons from "../../components/auth/SSOButtons";
import AuthLayout from "../../components/auth/AuthLayout";
import {
  enableOfflineAccess,
  getCurrentSession,
  offlineAccessIsConfigured,
  refreshCloudSession,
  unlockOfflineSession,
} from "../../services/authService";
import {
  isKeycloakEnabled,
  loginWithKeycloak,
  recoverKeycloakAccount,
} from "../../services/keycloakService";
import {
  createApiSyncTransport,
  synchronizeOfflineChanges,
} from "../../services/offlineSyncService";
import type { AuthSession } from "../../types/auth";

export type AuthMode = "login" | "signup";

function dashboardPickerPath(nextPath: string | null): string {
  return nextPath ? `/dashboard-picker?next=${encodeURIComponent(nextPath)}` : "/dashboard-picker";
}

export default function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<AuthSession | null>(() => getCurrentSession());
  const [offlineConfigured, setOfflineConfigured] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [offlineError, setOfflineError] = useState("");
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [oauthCompletionFailed, setOauthCompletionFailed] = useState(false);
  const oauthComplete = searchParams.get("oauth") === "complete";
  const oauthError = searchParams.has("oauth_error") || oauthCompletionFailed;
  const [switchingAccount] = useState(() => searchParams.get("switch") === "1");
  const requestedNextPath =
    searchParams.get("next") ??
    (typeof window === "undefined"
      ? null
      : sessionStorage.getItem("mbam-auth-next"));
  const nextPath =
    requestedNextPath?.startsWith("/") &&
    !requestedNextPath.startsWith("/auth") &&
    !requestedNextPath.startsWith("/access") &&
    !requestedNextPath.startsWith("/dashboard-picker")
      ? requestedNextPath
      : null;

  const completeSignIn = (authenticatedSession: AuthSession) => {
    setSession(authenticatedSession);
    if (switchingAccount) {
      window.location.assign(dashboardPickerPath(nextPath));
    }
  };

  useEffect(() => {
    void offlineAccessIsConfigured().then(setOfflineConfigured);
    if (!isKeycloakEnabled() && navigator.onLine && !switchingAccount) {
      void refreshCloudSession()
        .then(setSession)
        .catch(() => {
          if (oauthComplete) setOauthCompletionFailed(true);
        });
    }
  }, [oauthComplete, switchingAccount]);

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

  const enableOffline = async () => {
    if (!session) return;
    setOfflineBusy(true);
    setOfflineError("");
    try {
      await enableOfflineAccess(session, passphrase);
      await synchronizeOfflineChanges(createApiSyncTransport());
      navigate(dashboardPickerPath(nextPath), { replace: true });
    } catch {
      setOfflineError(t("auth.offlineSetupError"));
    } finally {
      setOfflineBusy(false);
    }
  };

  if (isKeycloakEnabled() && session) {
    return <Navigate to={dashboardPickerPath(nextPath)} replace />;
  }

  if (isKeycloakEnabled()) {
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

  if (session && !session.offlineGrant) {
    return <Navigate to={dashboardPickerPath(nextPath)} replace />;
  }

  if (session) {
    return (
      <AuthLayout mode="login">
        <div className="verify-screen" role="status">
          <div className="verify-icon">✓</div>
          <h2 className="verify-title">{t("auth.signedInTitle")}</h2>
          <p className="verify-body">{t("auth.signedInBody")}</p>
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
          <Link className="forgot-link" replace to={dashboardPickerPath(nextPath)}>
            {t("auth.continueOnline")}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode={mode}>
      {oauthError && (
        <div className="alert alert-danger" role="alert">
          {t("auth.socialError")}
        </div>
      )}
      <SSOButtons mode={mode} onSuccess={completeSignIn} />

      <div className="divider">
        <span>{t("auth.continueEmail")}</span>
      </div>

      {mode === "login" ? (
        <>
          <LoginForm
            onSwitch={() => setMode("signup")}
            onSuccess={completeSignIn}
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
