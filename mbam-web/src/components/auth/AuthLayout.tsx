import { type ReactNode } from "react";
import type { AuthMode } from "../../pages/auth/AuthPage";
import "./AuthLayout.css";

interface Props {
  children: ReactNode;
  mode: AuthMode;
}

export default function AuthLayout({ children, mode }: Props) {
  return (
    <div className="auth-root">
      {/* Left: brand panel */}
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <div className="brand-mark">
            <span className="brand-logo">Mbam</span>
            <span className="brand-tagline">Your business, recorded.</span>
          </div>
          <div className="brand-pattern" aria-hidden="true">
            {Array.from({ length: 48 }).map((_, i) => (
              <div key={i} className="pattern-dot" />
            ))}
          </div>
          <blockquote className="brand-quote">
            "The river flows through everything — so should your records."
          </blockquote>
        </div>
      </div>

      {/* Right: form panel */}
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div className="auth-mobile-logo">Mbam</div>

          <h1 className="auth-heading">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="auth-subheading">
            {mode === "login"
              ? "Sign in to your Mbam account"
              : "Start recording your sales for free"}
          </p>

          {children}
        </div>
      </div>
    </div>
  );
}
