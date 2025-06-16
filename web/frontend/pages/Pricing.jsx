import { Page, Layout, Card, Button } from "@shopify/polaris";
import { useEffect, useState } from "react";

export default function Pricing() {
  const [shop, setShop] = useState("");

  useEffect(() => {
    const shopParam = new URLSearchParams(window.location.search).get("shop");
    if (shopParam) {
      setShop(shopParam.replace(".myshopify.com", ""));
    }
  }, []);

  const handleRedirect = () => {
    const appHandle = "rg-quick-bulk-product-editor"; // 🔁 Replace with your actual app handle
    const redirectUrl = `https://admin.shopify.com/store/${shop}/charges/${appHandle}/pricing_plans`;

    // ✅ Simple browser redirect
    window.top.location.href = redirectUrl;
  };

  return (
    <Page title="Choose a Plan">
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <p>This app requires a subscription to continue.</p>
            <Button primary onClick={handleRedirect}>
              Go to Pricing Panel
            </Button>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
