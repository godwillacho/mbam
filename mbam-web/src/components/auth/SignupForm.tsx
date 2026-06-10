import { useState } from "react";
import { resendVerification, signupWithEmail } from "../../services/authService";
import { Eye, EyeOff, MailCheck } from "./icons";

interface Props {
  onSwitch: () => void;
}

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  general?: string;
}

type Screen = "form" | "verify";

function getStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: "", color: "transparent" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 20, label: "Weak", color: "#DC2626" };
  if (score === 2) return { score: 40, label: "Fair", color: "#D97706" };
  if (score === 3) return { score: 65, label: "Good", color: "#2D9D78" };
  return { score: 100, label: "Strong", color: "#166534" };
}

export default function SignupForm({ onSwitch }: Props) {
  const [form, setForm] = useState<FormState>({ fullName: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<Screen>("form");
  const [resent, setResent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const strength = getStrength(form.password);

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (form.fullName.trim().length < 2) e.fullName = "Enter your full name";
    if (!form.email.includes("@")) e.email = "Enter a valid email address";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters";
    else if (!/[A-Z]/.test(form.password)) e.password = "Add at least one uppercase letter";
    else if (!/[0-9]/.test(form.password)) e.password = "Add at least one number";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      await signupWithEmail({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      setScreen("verify");
    } catch {
      setErrors({ general: "We could not create your account. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await resendVerification(form.email);
      setResent(true);
      window.setTimeout(() => setResent(false), 5000);
    } catch {
      setErrors({ general: "We could not resend the verification request. Please try again." });
    } finally {
      setResendLoading(false);
    }
  };

  if (screen === "verify") {
    return (
      <div className="verify-screen">
        <div className="verify-icon">
          <MailCheck size={28} color="var(--forest)" />
        </div>
        <h2 className="verify-title">Check your inbox</h2>
        <p className="verify-body">
          We prepared a verification request for <strong>{form.email}</strong>. Email delivery will activate once the backend is connected.
        </p>
        <p className="verify-body" style={{ fontSize: "12px" }}>
          Your account details are saved locally so this screen behaves like the final flow.
        </p>
        {resent && (
          <div className="alert alert-success" style={{ width: "100%" }} role="status">
            Verification request refreshed.
          </div>
        )}
        <button className="resend-btn" type="button" onClick={handleResend} disabled={resendLoading}>
          {resendLoading ? "Refreshing request…" : "Resend verification email"}
        </button>
        <div className="switch-mode" style={{ marginTop: 8 }}>
          Already verified?{" "}
          <button type="button" onClick={onSwitch}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errors.general && (
        <div className="alert alert-danger" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {errors.general}
        </div>
      )}

      <div className="field-group">
        <div className="field">
          <label htmlFor="signup-name">Full name</label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            placeholder="e.g. Marie Ngono"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            className={errors.fullName ? "error" : ""}
          />
          {errors.fullName && <span className="field-error" role="alert">{errors.fullName}</span>}
        </div>

        <div className="field">
          <label htmlFor="signup-email">Email address</label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={errors.email ? "error" : ""}
          />
          {errors.email && <span className="field-error" role="alert">{errors.email}</span>}
        </div>

        <div className="field">
          <label htmlFor="signup-phone">
            Phone number{" "}
            <span className="field-hint">(optional)</span>
          </label>
          <input
            id="signup-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+237 6XX XXX XXX"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <div className="password-wrap">
            <input
              id="signup-password"
              type={showPass ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={errors.password ? "error" : ""}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {form.password.length > 0 && (
            <>
              <div className="strength-bar">
                <div
                  className="strength-fill"
                  style={{ width: `${strength.score}%`, background: strength.color }}
                />
              </div>
              <span className="strength-label" style={{ color: strength.color }}>
                {strength.label}
              </span>
            </>
          )}
          {errors.password && <span className="field-error" role="alert">{errors.password}</span>}
        </div>
      </div>

      <button type="submit" className="submit-btn" disabled={loading}>
        {loading && <span className="spinner" aria-hidden="true" />}
        {loading ? "Creating account…" : "Create account"}
      </button>

      <p className="terms">
        By signing up you agree to our{" "}
        <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
      </p>

      <div className="switch-mode">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch}>
          Sign in
        </button>
      </div>
    </form>
  );
}
