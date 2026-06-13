import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout from "../../components/auth/AuthLayout";
import { refreshCloudSession } from "../../services/authService";
import {
  acceptInvitation,
  getInvitationDetails,
  registerInvitation,
  type InvitationDetails,
} from "../../services/teamService";

const AUTH_NEXT_KEY = "mbam-auth-next";

export default function InviteAcceptancePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "accepted" | "error">("loading");
  const [showRegistration, setShowRegistration] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    getInvitationDetails(token)
      .then((details) => {
        setInvitation(details);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const accept = async () => {
    setStatus("accepting");
    try {
      await refreshCloudSession();
      await acceptInvitation(token);
      sessionStorage.removeItem(AUTH_NEXT_KEY);
      setStatus("accepted");
    } catch {
      sessionStorage.setItem(AUTH_NEXT_KEY, `/invite?token=${encodeURIComponent(token)}`);
      setShowRegistration(true);
      setStatus("ready");
    }
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("accepting");
    try {
      await registerInvitation(token, fullName, password);
      sessionStorage.setItem(AUTH_NEXT_KEY, "/dashboard");
      navigate("/auth");
    } catch {
      setStatus("error");
    }
  };

  return (
    <AuthLayout mode="signup">
      <div className="verify-screen">
        <h1 className="verify-title">{t("invite.title")}</h1>
        {status === "loading" && <p className="verify-body">{t("invite.loading")}</p>}
        {status === "error" && <div className="alert alert-danger">{t("invite.invalid")}</div>}
        {invitation && status !== "accepted" && status !== "error" && (
          <>
            <p className="verify-body">
              {t("invite.summary", {
                email: invitation.email,
                role: invitation.role_name,
                scope: invitation.business_unit_name ?? invitation.business_name ?? t("invite.masterAccount"),
              })}
            </p>
            <button className="submit-btn" type="button" disabled={status === "accepting"} onClick={accept}>
              {status === "accepting" ? t("invite.accepting") : t("invite.accept")}
            </button>
            {showRegistration && (
              <form style={{ width: "100%" }} onSubmit={register}>
                <p className="verify-body">{t("invite.newAccountHint")}</p>
                <div className="field">
                  <label htmlFor="invite-name">{t("invite.fullName")}</label>
                  <input id="invite-name" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="invite-password">{t("invite.password")}</label>
                  <input id="invite-password" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
                </div>
                <button className="submit-btn" disabled={status === "accepting"} type="submit">{t("invite.createAccount")}</button>
              </form>
            )}
          </>
        )}
        {status === "accepted" && (
          <>
            <div className="alert alert-success">{t("invite.accepted")}</div>
            <Link className="submit-btn" to="/dashboard">{t("invite.continue")}</Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
