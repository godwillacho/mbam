import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout from "../../components/auth/AuthLayout";
import { getCurrentSession } from "../../auth/authService";
import { isKeycloakEnabled, loginWithKeycloak } from "../../auth/keycloakService";
import {
  acceptInvitation,
  getInvitationDetails,
  type InvitationDetails,
} from "../../services/team/teamService";

const AUTH_NEXT_KEY = "mbam-auth-next";

export default function InviteAcceptancePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "accepted" | "error">("loading");

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
    if (isKeycloakEnabled() && !getCurrentSession()?.accessToken) {
      await loginWithKeycloak(window.location.href);
      return;
    }
    setStatus("accepting");
    try {
      await acceptInvitation(token);
      sessionStorage.removeItem(AUTH_NEXT_KEY);
      setStatus("accepted");
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
