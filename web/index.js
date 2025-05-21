// @ts-check
import express from "express";
import { readFileSync } from "fs";
import { join } from "path";
import serveStatic from "serve-static";
import PrivacyWebhookHandlers from "./privacy.js";
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

app.use("/api/*", shopify.validateAuthenticatedSession());
app.use(express.json());

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
  console.log('Applied CSP headers:', csp);
  next();
});

// Get Shopify domain (unchanged)
app.get('/api/domain', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    if (session && session.shop) {
      res.status(200).json({ domain: session.shop });
    } else {
      res.status(404).json({ error: 'Session not found or invalid' });
    }
  } catch (error) {
    console.error('Error retrieving myShopifyDomain:', error);
    res.status(500).json({ error: 'Failed to retrieve myShopifyDomain' });
  }
});

// Get products using GraphQL (unchanged, already uses GraphQL)
app.get("/api/products", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  let allProducts = [];
  let cursor = null;

  do {
    const productData = await client.request(`
      query($cursor: String) {
        products(first: 50, after: $cursor) {
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
    `, { variables: { cursor } });

    allProducts = allProducts.concat(productData.data.products.edges);

    cursor = productData.data.products.pageInfo.hasNextPage
      ? productData.data.products.pageInfo.endCursor
      : null;
  } while (cursor);

  res.status(200).send({ products: allProducts });
});

// Get collections using GraphQL (fixed to use client.request)
app.get('/api/collections', async (req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    const collections = await client.request(`
      query {
        collections(first: 10) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `);

    res.status(200).json(collections.data);
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections', details: error.message });
  }
});

// Get inventory levels using GraphQL (fixed to use quantities(names: ["available"]))
app.get('/api/inventorylevel', async (req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    const response = await client.request(`
      query {
        inventoryItems(first: 250, query: "location_id:83114426690 updated_at:>${new Date(Date.now() - 1000).toISOString()}") {
          edges {
            node {
              id
              sku
              inventoryLevel(locationId: "gid://shopify/Location/83114426690") {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
                updatedAt
              }
            }
          }
        }
      }
    `);

   
    const inventoryLevels = response.data.inventoryItems.edges.map(edge => ({
      inventory_item_id: edge.node.id.split('/').pop(),
      location_id: "83114426690",
      available: edge.node.inventoryLevel?.quantities.find(q => q.name === "available")?.quantity || 0,
      updated_at: edge.node.inventoryLevel?.updatedAt,
    }));

    res.status(200).json({ inventory_levels: inventoryLevels });
  } catch (error) {
    console.error('Error fetching inventory level:', {
      message: error.message,
      response: error.response?.body,
    });
    res.status(500).json({ 
      error: 'Failed to fetch inventory level',
      details: error.response?.body?.errors || error.message,
    });
  }
});

// Update inventory level using GraphQL (fixed to use quantities(names: ["available"]))
app.put('/api/inventorylevel/:id', async (req, res) => {
  const inventoryItemId = req.params.id;
  const { available, locationId = "83114426690" } = req.body;

  if (!inventoryItemId || available === undefined || isNaN(parseInt(available))) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid required fields',
      details: { inventoryItemId, locationId, available },
    });
  }

  try {
    const graphqlClient = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    // Fetch inventory item
    const itemData = await graphqlClient.request(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          id
          tracked
        }
      }
    `);
    const inventoryItem = itemData?.data?.inventoryItem;

    if (!inventoryItem) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found',
      });
    }

    // Enable inventory tracking via GraphQL
    if (!inventoryItem.tracked) {
      const trackingUpdate = await graphqlClient.request(`
        mutation {
          inventoryItemUpdate(input: {
            id: "gid://shopify/InventoryItem/${inventoryItemId}",
            tracked: true
          }) {
            userErrors {
              field
              message
            }
          }
        }
      `);

      if (trackingUpdate?.data?.inventoryItemUpdate?.userErrors?.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Failed to enable tracking',
          details: trackingUpdate.data.inventoryItemUpdate.userErrors,
        });
      }
    }

    // Update inventory quantity
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
      }
    });

    const userErrors = updateResponse?.data?.inventorySetOnHandQuantities?.userErrors;
    if (userErrors && userErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'GraphQL user error',
        details: userErrors,
      });
    }

    // Optional: fetch updated inventory level
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
    return res.status(500).json({
      success: false,
      error: 'Failed to update inventory',
      details: error.message,
    });
  }
});



// Update product collections using GraphQL (unchanged from previous update)
app.put('/api/product-collections/:id', async (req, res) => {
  const productId = req.params.id;
  const { collections } = req.body;
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    // Get current collections for the product
    const currentCollections = await client.request(`
      query {
        product(id: "gid://shopify/Product/${productId}") {
          collections(first: 50) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `);

    // Delete all existing collects
    const currentCollectionIds = currentCollections.data.product?.collections.edges.map(edge => edge.node.id) || [];
    const deletePromises = currentCollectionIds.map(collectionId => 
      client.request(`
        mutation collectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
          collectionRemoveProducts(id: $id, productIds: $productIds) {
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          id: collectionId,
          productIds: [`gid://shopify/Product/${productId}`],
        },
      })
    );
    await Promise.all(deletePromises);

    // If collections array is empty, all collects are removed
    if (collections && collections.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All collections removed from the product.',
      });
    }

    // Create new collects for provided collections
    const createPromises = collections.map(collectionId => {
      const cleanCollectionId = collectionId.split('/').pop();
      return client.request(`
        mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          id: `gid://shopify/Collection/${cleanCollectionId}`,
          productIds: [`gid://shopify/Product/${productId}`],
        },
      });
    });
    const results = await Promise.all(createPromises);

    // Check for user errors in results
    const errors = results.flatMap(r => r.data.collectionAddProducts?.userErrors || []);
    if (errors.length > 0) {
      throw new Error(errors.map(e => e.message).join(', '));
    }

    res.status(200).json({
      success: true,
      message: 'Collections updated successfully.',
      results,
    });
  } catch (error) {
    console.error('Error updating collections:', {
      message: error.message,
      response: error.response?.body,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update collections',
      details: error.response?.body?.errors || error.message,
    });
  }
});

// Update product using GraphQL (fixed to handle variants separately)
app.put('/api/products/:id', async (req, res) => {
  const productId = req.params.id;
  const { product } = req.body;

  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    // Validate input
    if (!product || !productId) {
      return res.status(400).json({
        success: false,
        error: 'Missing product data or product ID',
      });
    }

    // Prepare product update input
    const productInput = {
      id: `gid://shopify/Product/${productId}`,
      title: product.title,
      handle: product.handle,
      tags: product.tags || [],
      status: product.status ? product.status.toUpperCase() : 'ACTIVE', // Ensure uppercase enum (ACTIVE, DRAFT, ARCHIVED)
      descriptionHtml: product.descriptionHtml,
      productType: product.productType,
      vendor: product.vendor,
    };

    // Remove undefined fields to avoid GraphQL errors
    Object.keys(productInput).forEach(
      (key) => productInput[key] === undefined && delete productInput[key]
    );

    // Product update mutation
    const productUpdateMutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            handle
            tags
            status
            descriptionHtml
            productType
            vendor
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

    // Check for user errors in product update
    if (productUpdateResponse.data.productUpdate.userErrors.length > 0) {
      console.error('Product update user errors:', productUpdateResponse.data.productUpdate.userErrors);
      return res.status(400).json({
        success: false,
        error: 'Failed to update product',
        details: productUpdateResponse.data.productUpdate.userErrors,
      });
    }

    let variantUpdateResponse = null;

    // Update variants if provided
    if (product.variants && product.variants.length > 0) {
      const variantsInput = product.variants.map((variant) => ({
        id: `gid://shopify/ProductVariant/${variant.id}`,
        price: variant.price ? parseFloat(variant.price).toFixed(2) : undefined,
        compareAtPrice: variant.compare_at_price
          ? parseFloat(variant.compare_at_price).toFixed(2)
          : undefined,
        // Exclude sku as it's not supported in ProductVariantsBulkInput
      }));

      // Remove undefined fields from variants
      variantsInput.forEach((variant) => {
        Object.keys(variant).forEach(
          (key) => variant[key] === undefined && delete variant[key]
        );
      });

      // Variant update mutation
      const variantUpdateMutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            product {
              id
            }
            productVariants {
              id
              price
              compareAtPrice
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      variantUpdateResponse = await client.request(variantUpdateMutation, {
        variables: {
          productId: `gid://shopify/Product/${productId}`,
          variants: variantsInput,
        },
      });

      // Check for user errors in variant update
      if (variantUpdateResponse.data.productVariantsBulkUpdate.userErrors.length > 0) {
        console.error('Variant update user errors:', variantUpdateResponse.data.productVariantsBulkUpdate.userErrors);
        return res.status(400).json({
          success: false,
          error: 'Failed to update product variants',
          details: variantUpdateResponse.data.productVariantsBulkUpdate.userErrors,
        });
      }
    }

    // Combine response data
    const responseData = {
      success: true,
      product: productUpdateResponse.data.productUpdate.product,
      variants: variantUpdateResponse
        ? variantUpdateResponse.data.productVariantsBulkUpdate.productVariants
        : [],
      message: 'Product updated successfully',
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error updating product:', {
      timestamp: new Date().toISOString(),
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

// Create product using GraphQL (unchanged, placeholder for productCreator)
app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    // Sample productCreator logic using GraphQL (replace with actual productCreator logic)
    const response = await client.request(`
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            descriptionHtml
            vendor
            productType
            tags
            variants(first: 250) {
              edges {
                node {
                  id
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
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
    `, {
      variables: {
        input: {
          title: 'Sample Product',
          productType: 'Sample Type',
          vendor: 'Sample Vendor',
          // REPLACE THIS with your actual productCreator logic from product-creator.js
        },
      },
    });

    if (response.data.productCreate.userErrors.length > 0) {
      throw new Error(response.data.productCreate.userErrors.map(e => e.message).join(', '));
    }

    res.status(200).send({ success: true, product: response.data.productCreate.product });
  } catch (e) {
    console.error(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
    res.status(status).send({ success: status === 200, error });
  }
});

// Apply Shopify CSP headers (unchanged)
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

app.listen(PORT);