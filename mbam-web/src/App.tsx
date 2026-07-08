import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routing/AppRoutes";

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
