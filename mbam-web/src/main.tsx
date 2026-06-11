import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./i18n/roleDashboardResources";
import "./i18n/productRevenueResources";
import "./i18n/cleanDashboardResources";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
