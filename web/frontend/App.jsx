import { NavMenu } from "@shopify/app-bridge-react";
import "@shopify/polaris/build/esm/styles.css";
import { useTranslation } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import Routes from "./Routes";
import { PolarisProvider, QueryProvider } from "./components";

export default function App() {
  const pages = import.meta.glob("./pages/**/!(*.test.[jt]sx)*.([jt]sx)", {
    eager: true,
  });
  const { t } = useTranslation();

  return (
    <PolarisProvider>
      <BrowserRouter>
        <QueryProvider>
          <NavMenu>
            <a href="/" rel="home" />
          </NavMenu>
          {/* 👇 No BillingGuard here, it’s handled inside Routes.jsx */}
          <Routes pages={pages} />
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
