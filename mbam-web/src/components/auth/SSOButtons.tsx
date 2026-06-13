import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuthMode } from "../../pages/auth/AuthPage";
import { signInWithProvider } from "../../services/authService";
import type { AuthProvider, AuthSession } from "../../types/auth";

interface Props {
  mode: AuthMode;
  onSuccess: (session: AuthSession) => void;
}

const PROVIDERS: Array<{
  id: AuthProvider;
  label: string;
  icon: JSX.Element;
}> = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: "microsoft",
    label: "Microsoft",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24">
        <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
        <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
        <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
        <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
      </svg>
    ),
  },
];

export default function SSOButtons({ mode, onSuccess }: Props) {
  const { t } = useTranslation();
  const [activeProvider, setActiveProvider] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSSO = async (provider: AuthProvider) => {
    setActiveProvider(provider);
    setError(null);

    try {
      const session = await signInWithProvider(provider);
      onSuccess(session);
    } catch {
      setError(t("auth.socialError"));
    } finally {
      setActiveProvider(null);
    }
  };

  return (
    <div className="sso-group">
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {PROVIDERS.map((provider) => {
        const isLoading = activeProvider === provider.id;

        return (
          <button
            key={provider.id}
            className="sso-btn"
            onClick={() => handleSSO(provider.id)}
            type="button"
            disabled={activeProvider !== null}
          >
            <span className="sso-icon">{provider.icon}</span>
            <span className="sso-label">
              {isLoading
                ? t("auth.connectingProvider", { provider: provider.label })
                : t(mode === "login" ? "auth.continueWith" : "auth.signupWith", { provider: provider.label })}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-3)" }}>
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        );
      })}
    </div>
  );
}
