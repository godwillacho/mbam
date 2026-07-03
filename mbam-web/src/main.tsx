import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./components/charts/Charts.css";
import "./i18n/roleDashboardResources";
import "./i18n/productRevenueResources";
import "./i18n/cleanDashboardResources";
import "./i18n/csvImportResources";
import * as Sentry from "@sentry/react";
import { initializeObservability } from "./observability";
import { initializeKeycloak } from "./services/keycloakService";
import { hydrateActiveSession } from "./services/authSessionStore";

initializeObservability();

async function renderApplication() {
  await hydrateActiveSession().catch(() => undefined);
  await initializeKeycloak().catch(() => undefined);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Sentry.ErrorBoundary fallback={<p>Mbam encountered an unexpected error.</p>}>
        <App />
      </Sentry.ErrorBoundary>
    </React.StrictMode>,
  );
}

void renderApplication();
