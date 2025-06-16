import { BillingInterval, LATEST_API_VERSION } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { restResources } from "@shopify/shopify-api/rest/admin/2025-04";

const DB_PATH = `${process.cwd()}/database.sqlite`;

// Shopify Managed Pricing: No custom billing config needed
// Pricing is defined in the Partner Dashboard
// Do NOT add 'billing' config here
// Just ensure `unstable_managedPricingSupport` is enabled

const shopify = shopifyApp({
  api: {
    apiVersion: LATEST_API_VERSION,
    restResources,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true, // ✅ Required for managed pricing
    },
    billing: undefined, // ✅ Leave this undefined for Shopify Managed Pricing
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  sessionStorage: new SQLiteSessionStorage(DB_PATH), // ✅ You can also switch to PostgreSQL/MySQL/etc.
});

export default shopify;
