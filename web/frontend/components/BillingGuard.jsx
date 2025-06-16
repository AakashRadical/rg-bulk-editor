import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Spinner, Page } from "@shopify/polaris";

export default function BillingGuard({ children }) {
  const [checking, setChecking] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

useEffect(() => {
  const checkPlan = async () => {
    try {
      // console.log("Checking plan...");
      const res = await fetch("/api/plan/check", {
        method: "GET",
        credentials: "include", // make sure session cookie is sent
      });

      const contentType = res.headers.get("content-type");
      if (!res.ok || !contentType || !contentType.includes("application/json")) {
        console.error("Non-JSON or error response from plan check");
        navigate(`/pricing?shop=${new URLSearchParams(location.search).get("shop")}`);
        return;
      }

      const data = await res.json();
      // console.log("Plan check response:", data);

      if (data.status === "active") {
        setIsActive(true);
      } else {
        // console.log("Inactive plan, redirecting to pricing...");
        navigate(`/pricing?shop=${new URLSearchParams(location.search).get("shop")}`);
      }
    } catch (error) {
      console.error("Plan check failed", error);
      navigate(`/pricing?shop=${new URLSearchParams(location.search).get("shop")}`);
    } finally {
      setChecking(false);
    }
  };

  checkPlan();
}, []);



  if (checking) {
    return (
      <Page>
        <Spinner accessibilityLabel="Loading app" size="large" />
      </Page>
    );
  }

  return isActive ? children : null;
}
