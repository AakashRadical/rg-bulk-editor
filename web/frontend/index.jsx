import { createRoot } from "react-dom/client";
import App from "./App";
import ProductProvider from "./components/context/ProductContext";
import { initI18n } from "./utils/i18nUtils";

// Ensure that locales are loaded before rendering the app
initI18n().then(() => {
  const root = createRoot(document.getElementById("app"));
  root.render(
    <ProductProvider>
      <App />
    </ProductProvider>
  );
});
