// @ts-check

import express from "express";

import { readFileSync } from "fs";

import { join } from "path";

import serveStatic from "serve-static";

import PrivacyWebhookHandlers from "./privacy.js";

import productCreator from "./product-creator.js";

import shopify from "./shopify.js";

import { DataType } from "@shopify/shopify-api";

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",

  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();
app.use(express.json());

// Set up Shopify authentication and webhook handling

app.get(shopify.config.auth.path, shopify.auth.begin());

app.get(
  shopify.config.auth.callbackPath,

  shopify.auth.callback(),

  shopify.redirectToShopifyOrAppRoot()
);

app.post(
  shopify.config.webhooks.path,

  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);
const ensureBillingActive = async (req, res, next) => {
  try {
    const session = res.locals.shopify.session;
    const client = new shopify.api.clients.Rest({ session });

    const response = await client.get({
      path: "recurring_application_charges",
    });

    const activeCharge = response.body.recurring_application_charges.find(
      (charge) => charge.status === "active"
    );

    if (!activeCharge) {
      return res.redirect(`/pricing?shop=${session.shop}`);
    }

    next();
  } catch (error) {
    console.error("Plan check failed:", error);
    return res.redirect(`/pricing?shop=${session?.shop || "unknown"}`);
  }
};

app.get(
  "/api/plan/check",
  shopify.validateAuthenticatedSession(), // <-- REQUIRED!
  async (req, res) => {
    try {
      const session = res.locals.shopify?.session;
      if (!session) {
        return res.status(401).json({ error: "No session" });
      }

      const client = new shopify.api.clients.Rest({ session });

      const response = await client.get({
        path: "recurring_application_charges",
      });

      const activeCharge = response.body.recurring_application_charges?.find(
        (charge) => charge.status === "active"
      );

      if (activeCharge) {
        return res.status(200).json({
          plan: activeCharge.name,
          status: "active",
          charge_id: activeCharge.id,
        });
      } else {
        return res.status(200).json({ plan: null, status: "inactive" });
      }
    } catch (error) {
      console.error("🔥 /api/plan/check failed:", error);
      return res.status(500).json({ error: "Plan check failed" });
    }
  }
);



app.use("/api/*", shopify.validateAuthenticatedSession(), ensureBillingActive);









// Plan check API (optional for frontend plan fetch)


app.get("/api/plan/confirm", async (req, res) => {
  const session = res.locals.shopify.session;
  const { charge_id } = req.query;

  try {
    const client = new shopify.api.clients.Rest({ session });

    const result = await client.get({
      path: `recurring_application_charges/${charge_id}`,
    });

    const charge = result.body.recurring_application_charge;

    if (charge.status === "accepted") {
      await client.post({
        path: `recurring_application_charges/${charge_id}/activate`,
      });

      // console.log(`Plan "${charge.name}" activated for ${session.shop}`);
      res.redirect(`/?shop=${session.shop}`);
    } else {
      res.redirect(`/pricing?shop=${session.shop}`);
    }
  } catch (error) {
    console.error("Billing confirmation error:", error);
    res.redirect(`/pricing?shop=${session.shop}`);
  }
});


// Custom CSP middleware to ensure scripts are allowed

app.use((req, res, next) => {
  const csp = [
    "default-src 'self'",

    "script-src 'self' https://cdn.shopify.com https://painted-friends-forests-vessel.trycloudflare.com",

    "connect-src 'self' https://painted-friends-forests-vessel.trycloudflare.com wss://painted-friends-forests-vessel.trycloudflare.com",

    "frame-ancestors https://admin.shopify.com https://*.myshopify.com",

    "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",

    "img-src 'self' data: https: blob:",
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);

  // console.log("Applied CSP headers:", csp);

  next();});


app.get("/api/domain", async (req, res) => {
  try {
    const session = res.locals.shopify.session;

    if (session && session.shop) {
      res.status(200).json({ domain: session.shop });
    } else {
      res.status(404).json({ error: "Session not found or invalid" });
    }
  } catch (error) {
    console.error("Error retrieving myShopifyDomain:", error);

    res.status(500).json({ error: "Failed to retrieve myShopifyDomain" });
  }
});


app.get("/api/locations", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const client = new shopify.api.clients.Graphql({ session });
    const query = `{
      locations(first: 10) {
        edges {
          node {
            id
            name
            address {
              city
              country
            }
          }
        }
      }
    }`;
    const response = await client.request(query);
    const locations = response.data.locations.edges.map(edge => edge.node);

    res.status(200).json({ locations });
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});


// Get products using GraphQL

app.get("/api/products", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  let allProducts = [];

  let cursor = null;

  do {
    const productData = await client.request(
      `

      query($cursor: String) {

        products(first: 10, after: $cursor) {

          edges {

            node {

              id

              title

              handle

              updatedAt

              isGiftCard

              productType

              descriptionHtml

              standardizedProductType {

                productTaxonomyNode {

                  name

                  fullName

                }

              }

              featuredImage {

                id

                originalSrc

              }

              images(first: 10) {

                edges {

                  node {

                    id

                    originalSrc

                    altText

                    height

                  }

                }

              }

              media(first: 10) {

                edges {

                  node {

                    ... on Video {

                      id

                      sources {

                        url

                        format

                        height

                        width

                      }

                    }

                  }

                }

              }

              variants(first: 1) {

                edges {

                  node {

                    id

                    sku

                    price

                    compareAtPrice

                    inventoryQuantity

                    inventoryItem {

                      id

                      sku

                      __typename

                    }

                    metafields(namespace: "shipping", first: 3) {

                      edges {

                        node {

                          key

                          value

                        }

                      }

                    }

                  }

                }

              }

              collections(first: 10) {

                edges {

                  node {

                    id

                    title

                  }

                }

              }

              metafields(first: 10) {

                edges {

                  node {

                    id

                    namespace

                    key

                    value

                  }

                }

              }

              createdAt

              status

              tags

              vendor

              __typename

              totalInventory

            }

            cursor

            __typename

          }

          pageInfo {

            hasNextPage

            endCursor

          }

        }

      }

    `,
      { variables: { cursor } }
    );

    allProducts = allProducts.concat(productData.data.products.edges);

    cursor = productData.data.products.pageInfo.hasNextPage
      ? productData.data.products.pageInfo.endCursor
      : null;
  } while (cursor);

  res.status(200).send({ products: allProducts });
});

// Get collections using GraphQL
app.get("/api/collections", async (req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    const response = await client.request(`
      {
        collections(first: 10) {
          edges {
            node {
              id
              title
              description
            }
          }
        }
      }
    `);
    res.status(200).json({ body: response });
  } catch (error) {
    console.error("Error fetching collections:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch collections", details: error.message });
  }
});

// Get inventory levels with cache-busting
app.get("/api/inventorylevel", async (req, res) => {
  const session = res.locals.shopify.session;

  try {
    const client = new shopify.api.clients.Graphql({ session });

    const locationQuery = `
      {
        locations(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;
    const locationResponse = await client.request(locationQuery);
    
    const locationId = locationResponse.data?.locations?.edges?.[0]?.node?.id;
// console.log("Location ID", locationId);
    if (!locationId) {
      return res.status(400).json({ error: "No location ID found in shop." });
    }

    // Construct the query string with the dynamic date
    const timeString = new Date(Date.now() - 1000).toISOString(); // ISO format
    const inventoryQuery = `
      {
        location(id: "${locationId}") {
          inventoryLevels(first: 250, query: "updated_at:>${timeString}") {
            edges {
              node {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
                item {
                  id
                }
                updatedAt
              }
            }
          }
        }
      }
    `;

    const inventoryResponse = await client.request(inventoryQuery);

    const inventoryLevels = inventoryResponse.data?.location?.inventoryLevels?.edges?.map(edge => ({
      id: edge.node.id,
      available: edge.node.quantities.find(q => q.name === "available")?.quantity || 0,
      item: edge.node.item,
      updatedAt: edge.node.updatedAt,
    })) || [];

    res.status(200).json(inventoryLevels);
  } catch (error) {
    console.error("Error fetching inventory level:", {
      message: error.message,
      response: error.response?.body,
    });

    res.status(500).json({
      error: "Failed to fetch inventory level",
      details: error.response?.body?.errors || error.message,
    });
  }
});




// Update inventory level
app.put('/api/inventorylevel/:id', async (req, res) => {
  const inventoryItemId = req.params.id;
  const { available, locationId, sku } = req.body;

  if (!inventoryItemId || available === undefined || isNaN(parseInt(available)) || !locationId) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid required fields',
      details: { inventoryItemId, locationId, available, sku },
    });
  }

  try {
    const graphqlClient = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    // Validate location
    const locationQuery = await graphqlClient.request(`
      query {
        location(id: "gid://shopify/Location/${locationId}") {
          id
          name
        }
      }
    `);
    if (!locationQuery?.data?.location) {
      console.error(`Invalid location ID: ${locationId}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid location ID',
        details: { locationId },
      });
    }

    // Fetch inventory item
    const itemData = await graphqlClient.request(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          id
          tracked
          variant {
            sku
          }
          inventoryLevel(locationId: "gid://shopify/Location/${locationId}") {
            id
            quantities(names: ["available"]) {
              name
              quantity
            }
          }
        }
      }
    `);
    const inventoryItem = itemData?.data?.inventoryItem;

    if (!inventoryItem) {
      console.error(`Inventory item not found for ID: ${inventoryItemId}`);
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found',
      });
    }

    // Enable inventory tracking if disabled
    if (!inventoryItem.tracked) {
      // console.log(`Enabling inventory tracking for item: ${inventoryItemId}`);
      const enableTrackingMutation = `
        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            inventoryItem {
              id
              tracked
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      const enableTrackingResponse = await graphqlClient.request(enableTrackingMutation, {
        variables: {
          id: `gid://shopify/InventoryItem/${inventoryItemId}`,
          input: { tracked: true },
        },
      });

      const { inventoryItemUpdate } = enableTrackingResponse.data;
      if (inventoryItemUpdate.userErrors && inventoryItemUpdate.userErrors.length > 0) {
        console.error('Failed to enable inventory tracking:', inventoryItemUpdate.userErrors);
        return res.status(400).json({
          success: false,
          error: 'Failed to enable inventory tracking',
          details: inventoryItemUpdate.userErrors,
        });
      }

      // console.log(`Inventory tracking enabled for item: ${inventoryItemId}`);
    }

    // Update SKU if provided (like REST API)
    if (sku) {
      const inventoryItemUpdateMutation = `
        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            inventoryItem {
              id
              sku
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      console.log('Inventory Item SKU Input:', JSON.stringify({ id: `gid://shopify/InventoryItem/${inventoryItemId}`, input: { sku } }, null, 2));

      if (inventoryItem.variant?.sku && inventoryItem.variant.sku !== sku) {
        console.warn(`Updating SKU from ${inventoryItem.variant.sku} to ${sku} for inventory item: ${inventoryItemId}`);
      }

      const inventoryItemUpdateResponse = await graphqlClient.request(inventoryItemUpdateMutation, {
        variables: {
          id: `gid://shopify/InventoryItem/${inventoryItemId}`,
          input: { sku },
        },
      });

      const { inventoryItemUpdate } = inventoryItemUpdateResponse.data;
      if (inventoryItemUpdate.userErrors && inventoryItemUpdate.userErrors.length > 0) {
        console.error('SKU update errors:', inventoryItemUpdate.userErrors);
        return res.status(400).json({
          success: false,
          error: 'Failed to update SKU',
          details: inventoryItemUpdate.userErrors,
        });
      }

      console.log('SKU updated successfully for inventory item:', inventoryItemId);
    }

    console.log('Inventory item:', inventoryItem);

    // Activate inventory if needed
    if (!inventoryItem.inventoryLevel) {
      console.log(`Activating inventory for item ${inventoryItemId} at location ${locationId}`);
      const activateResponse = await graphqlClient.request(`
        mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
          inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
            inventoryLevel {
              id
              quantities(names: ["available"]) {
                name
                quantity
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
          locationId: `gid://shopify/Location/${locationId}`,
        },
      });

      console.log('Inventory activate response:', JSON.stringify(activateResponse, null, 2));

      const activateErrors = activateResponse?.data?.inventoryActivate?.userErrors;
      if (activateErrors && activateErrors.length > 0) {
        console.error('Inventory activation errors:', activateErrors);
        return res.status(400).json({
          success: false,
          error: 'Failed to activate inventory at location',
          details: activateErrors,
        });
      }

      if (!activateResponse?.data?.inventoryActivate?.inventoryLevel) {
        console.error('Inventory activation failed, no inventory level returned');
        return res.status(500).json({
          success: false,
          error: 'Failed to activate inventory at location',
          details: 'No inventory level returned from mutation',
        });
      }
    }

    // Update inventory
    console.log(`Updating inventory for item ${inventoryItemId} at location ${locationId} to ${available}`);
    const updateResponse = await graphqlClient.request(`
      mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          setQuantities: [{
            inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
            locationId: `gid://shopify/Location/${locationId}`,
            quantity: parseInt(available),
          }],
          reason: "correction",
        },
      },
    });

    const userErrors = updateResponse?.data?.inventorySetOnHandQuantities?.userErrors;
    if (userErrors && userErrors.length > 0) {
      console.error('Inventory update errors:', userErrors);
      return res.status(400).json({
        success: false,
        error: 'GraphQL user error',
        details: userErrors,
      });
    }

    // Fetch updated inventory
    let updatedInventory = null;
    try {
      const invResponse = await graphqlClient.request(`
        query {
          inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
            inventoryLevel(locationId: "gid://shopify/Location/${locationId}") {
              id
              quantities(names: ["available"]) {
                name
                quantity
              }
              updatedAt
            }
          }
        }
      `);
      updatedInventory = invResponse?.data?.inventoryItem?.inventoryLevel;
    } catch (e) {
      console.warn("Failed to fetch updated inventory", e.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Inventory updated successfully',
      updatedInventory,
    });
  } catch (error) {
    console.error('Inventory update error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update inventory',
      details: error.message,
    });
  }
});


// Update product collections
app.put("/api/product-collections/:id", async (req, res) => {
  const productId = req.params.id;
  const { collections } = req.body;
  const session = res.locals.shopify.session;

  try {
    const client = new shopify.api.clients.Graphql({ session });

    // Ensure productId is in GraphQL ID format
    const formattedProductId = productId.startsWith('gid://shopify/Product/')
      ? productId
      : `gid://shopify/Product/${productId}`;

    // Get current collects
    const collectQuery = `
      query {
        product(id: "${formattedProductId}") {
          id
          collections(first: 250) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `;

    const currentCollectsResponse = await client.request(collectQuery);

    // Check if product exists
    if (!currentCollectsResponse.data?.product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    const currentCollects = currentCollectsResponse.data?.product?.collections?.edges?.map(edge => edge.node) || [];

    // Delete all existing collects
    const deletePromises = currentCollects.map((collect) => {
      const deleteMutation = `
        mutation {
          collectionRemoveProducts(id: "${collect.id}", productIds: ["${formattedProductId}"]) {
            userErrors {
              field
              message
            }
          }
        }
      `;
      return client.request(deleteMutation).catch((err) => {
        console.error(`Failed to remove product from collection ${collect.id}:`, err.message);
        throw err;
      });
    });

    await Promise.all(deletePromises);

    // If collections array is empty, all collects are removed
    if (collections && collections.length === 0) {
      return res.status(200).json({
        success: true,
        message: "All collections removed from the product.",
      });
    }

    // Create new collects for provided collections
    const createPromises = collections.map((collectionId) => {
      const cleanCollectionId = collectionId.split("/").pop();
      const formattedCollectionId = cleanCollectionId.startsWith('gid://shopify/Collection/')
        ? cleanCollectionId
        : `gid://shopify/Collection/${cleanCollectionId}`;
      const createMutation = `
        mutation {
          collectionAddProducts(id: "${formattedCollectionId}", productIds: ["${formattedProductId}"]) {
            userErrors {
              field
              message
            }
          }
        }
      `;
      return client.request(createMutation).catch((err) => {
        console.error(`Failed to add product to collection ${cleanCollectionId}:`, err.message);
        throw err;
      });
    });

    const results = await Promise.all(createPromises);

    res.status(200).json({
      success: true,
      message: "Collections updated successfully.",
      results,
    });
  } catch (error) {
    console.error("Error updating collections:", {
      message: error.message,
      response: error.response?.body,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: "Failed to update collections",
      details: error.response?.body?.errors || error.message,
    });
  }
});
// Update product
// product route

app.put('/api/products/:id', async (req, res) => {
  const productId = req.params.id;
  const { product } = req.body;

  // Log request body for debugging
  console.log('Request Body:', JSON.stringify(req.body, null, 2));

  if (!product || !product.variants || !product.variants.length) {
    return res.status(400).json({
      success: false,
      error: 'Invalid product data',
      details: 'Product and variants are required',
    });
  }

  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    // Format product ID for GraphQL
    const formattedProductId = productId.startsWith('gid://shopify/Product/')
      ? productId
      : `gid://shopify/Product/${productId}`;

    // Normalize status to valid enum values (ACTIVE, ARCHIVED, DRAFT)
    const validStatus = product.status
      ? product.status.toUpperCase()
      : undefined;
    if (validStatus && !['ACTIVE', 'ARCHIVED', 'DRAFT'].includes(validStatus)) {
      throw new Error(`Invalid status: ${product.status}. Must be one of: ACTIVE, ARCHIVED, DRAFT`);
    }

    // Prepare product input for productUpdate mutation
    const productInput = {
      id: formattedProductId,
      title: product.title || undefined,
      descriptionHtml: product.descriptionHtml || undefined,
      vendor: product.vendor || undefined,
      productType: product.productType || undefined,
      tags: product.tags ? product.tags.join(',') : undefined,
      status: validStatus,
    };

    // Log input for debugging
    console.log('Product Input:', JSON.stringify(productInput, null, 2));

    // GraphQL mutation to update product
    const productUpdateMutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const productUpdateResponse = await client.request(productUpdateMutation, {
      variables: { input: productInput },
    });

    const { productUpdate } = productUpdateResponse.data;
    if (productUpdate.userErrors && productUpdate.userErrors.length > 0) {
      console.error('Product update errors:', productUpdate.userErrors);
      return res.status(400).json({
        success: false,
        error: 'Failed to update product',
        details: productUpdate.userErrors,
      });
    }

    // Prepare variant updates (excluding SKU for productVariantsBulkUpdate)
    const variantInputs = product.variants.map(variant => ({
      id: variant.id
        ? (variant.id.startsWith('gid://shopify/ProductVariant/')
            ? variant.id
            : `gid://shopify/ProductVariant/${variant.id}`)
        : undefined,
      price: variant.price ? parseFloat(variant.price).toFixed(2) : undefined,
      compareAtPrice: variant.compareAtPrice
        ? parseFloat(variant.compareAtPrice).toFixed(2)
        : undefined,
      inventoryPolicy: variant.inventory_policy || undefined,
    }));

    // Log variant inputs for debugging
    console.log('Variant Inputs:', JSON.stringify(variantInputs, null, 2));

    // Update variants (price, compareAtPrice, inventoryPolicy)
    const variantsUpdateMutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  compareAtPrice
                  inventoryPolicy
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variantsUpdateResponse = await client.request(variantsUpdateMutation, {
      variables: {
        productId: formattedProductId,
        variants: variantInputs,
      },
    });

    const { productVariantsBulkUpdate } = variantsUpdateResponse.data;
    if (
      productVariantsBulkUpdate.userErrors &&
      productVariantsBulkUpdate.userErrors.length > 0
    ) {
      console.error('Variant update errors:', productVariantsBulkUpdate.userErrors);
      return res.status(400).json({
        success: false,
        error: 'Failed to update variants',
        details: productVariantsBulkUpdate.userErrors,
      });
    }

    // Update inventory tracking and SKU
    const inventoryItemUpdateMutation = `
      mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          inventoryItem {
            id
            sku
            tracked
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variantsWithTrackingOrSku = product.variants.filter(
      variant => variant.tracked !== undefined || (variant.inventory_management === 'shopify' && variant.sku && variant.inventory_item_id)
    );

    for (const variant of variantsWithTrackingOrSku) {
      const inventoryItemId = variant.inventory_item_id
        ? (variant.inventory_item_id.startsWith('gid://shopify/InventoryItem/')
            ? variant.inventory_item_id
            : `gid://shopify/InventoryItem/${variant.inventory_item_id}`)
        : undefined;

      if (!inventoryItemId) {
        console.warn('Skipping tracking/SKU update due to missing inventory item ID:', variant);
        continue;
      }

      const inventoryItemInput = {
        tracked: variant.tracked !== undefined ? variant.tracked : undefined,
        sku: variant.sku || undefined,
      };

      // Only include defined fields in the input
      const filteredInventoryItemInput = Object.fromEntries(
        Object.entries(inventoryItemInput).filter(([_, value]) => value !== undefined)
      );

      console.log('Inventory Item Input:', JSON.stringify({ id: inventoryItemId, input: filteredInventoryItemInput }, null, 2));

      // Log existing SKU and tracking status for debugging
      try {
        const existingItemQuery = await client.request(`
          query {
            inventoryItem(id: "${inventoryItemId}") {
              sku
              tracked
            }
          }
        `);
        const existingSku = existingItemQuery.data?.inventoryItem?.sku;
        const existingTracked = existingItemQuery.data?.inventoryItem?.tracked;
        if (existingSku !== variant.sku || existingTracked !== variant.tracked) {
          console.log(`Updating inventory item ${inventoryItemId}: SKU from ${existingSku} to ${variant.sku}, tracked from ${existingTracked} to ${variant.tracked}`);
        }
      } catch (e) {
        console.warn('Failed to fetch existing inventory item for logging:', e.message);
      }

      const inventoryItemUpdateResponse = await client.request(inventoryItemUpdateMutation, {
        variables: {
          id: inventoryItemId,
          input: filteredInventoryItemInput,
        },
      });

      const { inventoryItemUpdate } = inventoryItemUpdateResponse.data;
      if (
        inventoryItemUpdate.userErrors &&
        inventoryItemUpdate.userErrors.length > 0
      ) {
        console.error('Inventory item update errors:', inventoryItemUpdate.userErrors);
        return res.status(400).json({
          success: false,
          error: 'Failed to update inventory item',
          details: inventoryItemUpdate.userErrors,
        });
      }

      console.log('Inventory item updated successfully:', inventoryItemId);
    }

    // Handle inventory updates
    const inventoryUpdates = product.variants
      .filter(
        variant =>
          variant.inventory_management === 'shopify' &&
          variant.inventory_quantity !== undefined &&
          variant.location_id &&
          variant.inventory_item_id
      )
      .map(variant => ({
        inventoryItemId: variant.inventory_item_id
          ? (variant.inventory_item_id.startsWith('gid://shopify/InventoryItem/')
              ? variant.inventory_item_id
              : `gid://shopify/InventoryItem/${variant.inventory_item_id}`)
          : undefined,
        locationId: variant.location_id
          ? (variant.location_id.startsWith('gid://shopify/Location/')
              ? variant.location_id
              : `gid://shopify/Location/${variant.location_id}`)
          : undefined,
        quantity: parseInt(variant.inventory_quantity),
      }));

    // Log inventory updates for debugging
    console.log('Inventory Updates:', JSON.stringify(inventoryUpdates, null, 2));

    if (inventoryUpdates.length > 0) {
      const inventorySetMutation = `
        mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
          inventorySetOnHandQuantities(input: $input) {
            inventoryAdjustmentGroup {
              id
              reason
              changes {
                name
                delta
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      for (const update of inventoryUpdates) {
        if (!update.inventoryItemId || !update.locationId) {
          console.warn('Skipping inventory update due to missing IDs:', update);
          continue;
        }

        // Check if inventory level exists
        const itemData = await client.request(`
          query {
            inventoryItem(id: "${update.inventoryItemId}") {
              id
              tracked
              inventoryLevel(locationId: "${update.locationId}") {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
            }
          }
        `);
        const inventoryItem = itemData?.data?.inventoryItem;

        if (!inventoryItem) {
          console.error(`Inventory item not found for ID: ${update.inventoryItemId}`);
          return res.status(404).json({
            success: false,
            error: 'Inventory item not found',
            details: { inventoryItemId: update.inventoryItemId },
          });
        }

        // Activate inventory level if it doesn't exist
        if (!inventoryItem.inventoryLevel) {
          console.log(`Activating inventory for item ${update.inventoryItemId} at location ${update.locationId}`);
          const activateResponse = await client.request(`
            mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
              inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
                inventoryLevel {
                  id
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `, {
            variables: {
              inventoryItemId: update.inventoryItemId,
              locationId: update.locationId,
            },
          });

          const activateErrors = activateResponse?.data?.inventoryActivate?.userErrors;
          if (activateErrors && activateErrors.length > 0) {
            console.error('Inventory activation errors:', activateErrors);
            return res.status(400).json({
              success: false,
              error: 'Failed to activate inventory at location',
              details: activateErrors,
            });
          }

          if (!activateResponse?.data?.inventoryActivate?.inventoryLevel) {
            console.error('Inventory activation failed, no inventory level returned');
            return res.status(500).json({
              success: false,
              error: 'Failed to activate inventory at location',
              details: 'No inventory level returned from mutation',
            });
          }
        }

        console.log('Inventory Update Input:', JSON.stringify(update, null, 2));

        // Set the exact quantity using inventorySetOnHandQuantities
        const inventoryResponse = await client.request(inventorySetMutation, {
          variables: {
            input: {
              setQuantities: [
                {
                  inventoryItemId: update.inventoryItemId,
                  locationId: update.locationId,
                  quantity: update.quantity,
                },
              ],
              reason: 'correction',
            },
          },
        });

        console.log('Inventory Set Response:', JSON.stringify(inventoryResponse.data, null, 2));

        const { inventorySetOnHandQuantities } = inventoryResponse.data;
        if (
          inventorySetOnHandQuantities.userErrors &&
          inventorySetOnHandQuantities.userErrors.length > 0
        ) {
          console.error('Inventory update errors:', inventorySetOnHandQuantities.userErrors);
          return res.status(400).json({
            success: false,
            error: 'Failed to update inventory',
            details: inventorySetOnHandQuantities.userErrors,
          });
        }

        // Verify the updated inventory level
        const verifyInventory = await client.request(`
          query {
            inventoryItem(id: "${update.inventoryItemId}") {
              inventoryLevel(locationId: "${update.locationId}") {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
            }
          }
        `);

        console.log('Verified Inventory Level:', JSON.stringify(verifyInventory.data, null, 2));

        const updatedQuantity = verifyInventory?.data?.inventoryItem?.inventoryLevel?.quantities.find(q => q.name === 'available')?.quantity;
        if (updatedQuantity !== update.quantity) {
          console.warn(`Inventory update verification failed for item ${update.inventoryItemId}. Expected ${update.quantity}, got ${updatedQuantity}`);
        }
      }
    }

    // Fetch updated inventory for response
    const updatedVariants = [];
    for (const variant of product.variants) {
      if (
        variant.inventory_management === 'shopify' &&
        variant.inventory_item_id &&
        variant.location_id
      ) {
        const inventoryItemId = variant.inventory_item_id.startsWith('gid://shopify/InventoryItem/')
          ? variant.inventory_item_id
          : `gid://shopify/InventoryItem/${variant.inventory_item_id}`;
        const locationId = variant.location_id.startsWith('gid://shopify/Location/')
          ? variant.location_id
          : `gid://shopify/Location/${variant.location_id}`;

        try {
          const invResponse = await client.request(`
            query {
              inventoryItem(id: "${inventoryItemId}") {
                inventoryLevel(locationId: "${locationId}") {
                  id
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                  updatedAt
                }
              }
            }
          `);
          updatedVariants.push({
            variantId: variant.id,
            inventoryLevel: invResponse?.data?.inventoryItem?.inventoryLevel,
          });
        } catch (e) {
          console.warn(`Failed to fetch updated inventory for variant ${variant.id}:`, e.message);
        }
      }
    }

    res.status(200).json({
      success: true,
      product: productUpdate.product,
      variants: productVariantsBulkUpdate.product.variants.edges.map(
        edge => edge.node
      ),
      updatedInventory: updatedVariants,
    });
  } catch (error) {
    console.error('Error updating product:', {
      message: error.message,
      response: error.response?.body,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update product',
      details: error.response?.body?.errors || error.message,
    });
  }
});

// Create product

app.post("/api/products", async (_req, res) => {
  let status = 200;

  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.error(`Failed to process products/create: ${e.message}`);

    status = 500;

    error = e.message;
  }

  res.status(status).send({ success: status === 200, error });
});

// Apply Shopify CSP headers (after custom CSP for precedence)

app.use(shopify.cspHeaders());

app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res

    .status(200)

    .set("Content-Type", "text/html")

    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()

        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

app.listen(PORT,() => {
  console.log(`Express server listening on port ${PORT}`);
});
