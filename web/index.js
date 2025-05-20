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

// Get Shopify domain
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

// Get products using GraphQL
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

// Get collections using GraphQL
app.get('/api/collections', async (req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  try {
    const collections = await client.query({
      data: `
        {
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
      `,
    });

    res.status(200).json(collections);
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections', details: error.message });
  }
});

// Get inventory levels with cache-busting
app.get('/api/inventorylevel', async (req, res) => {
  const session = res.locals.shopify.session;

  try {
    const inventoryLevels = await shopify.api.rest.InventoryLevel.all({
      session: session,
      location_ids: "83114426690",
      limit: 250,
      updated_at_min: new Date(Date.now() - 1000).toISOString(),
    });
    res.status(200).json(inventoryLevels);
  } catch (error) {
    console.error('Error fetching inventory level:', {
      message: error.message,
      response: error.response?.body,
    });
    res.status(500).json({ 
      error: 'Failed to fetch inventory level',
      details: error.response?.body?.errors || error.message 
    });
  }
});

// Update inventory level
app.put('/api/inventorylevel/:id', async (req, res) => {
  // Log the incoming request details
  console.log('Received inventory update request:', {
    timestamp: new Date().toISOString(),
    inventoryItemId: req.params.id,
    body: req.body,
    headers: req.headers,
  });

  const inventoryItemId = req.params.id;
  const { available, locationId = "83114426690" } = req.body;

  // Validate inputs
  console.log('Validating inputs:', { inventoryItemId, available, locationId });
  if (!inventoryItemId || available === undefined || isNaN(parseInt(available))) {
    console.error('Input validation failed:', {
      inventoryItemId,
      available,
      locationId,
    });
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid required fields',
      details: { inventoryItemId, locationId, available },
    });
  }

  try {
    const client = new shopify.api.clients.Rest({
      session: res.locals.shopify.session,
    });

    // Log session details
    console.log('Shopify session:', {
      shop: res.locals.shopify.session?.shop,
      sessionId: res.locals.shopify.session?.id,
    });

    // Check if inventory tracking is enabled
    console.log('Fetching inventory item:', { inventoryItemId });
    const inventoryItemResponse = await client.get({
      path: `inventory_items/${inventoryItemId}.json`,
    });
    console.log('Inventory item response:', {
      status: inventoryItemResponse.status,
      headers: inventoryItemResponse.headers,
      body: JSON.stringify(inventoryItemResponse.body, null, 2),
    });

    const inventoryItem = inventoryItemResponse.body?.inventory_item;
    if (!inventoryItem) {
      console.error('Inventory item not found in response:', inventoryItemResponse.body);
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found',
        details: inventoryItemResponse.body,
      });
    }

    if (!inventoryItem.tracked) {
      console.log(`Inventory tracking not enabled for inventoryItemId: ${inventoryItemId}. Enabling now.`);
      const trackingResponse = await client.put({
        path: `inventory_items/${inventoryItemId}.json`,
        data: {
          inventory_item: {
            id: inventoryItemId,
            tracked: true,
          },
        },
        type: DataType.JSON,
      });
      console.log('Inventory tracking enable response:', {
        status: trackingResponse.status,
        headers: trackingResponse.headers,
        body: JSON.stringify(trackingResponse.body, null, 2),
      });
    } else {
      console.log(`Inventory tracking already enabled for inventoryItemId: ${inventoryItemId}`);
    }

    // Retry mechanism for API calls
    const retry = async (fn, maxRetries = 3, delay = 1000) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          console.log(`Attempt ${i + 1} of ${maxRetries} for API call`);
          const result = await fn();
          console.log('API call succeeded:', {
            attempt: i + 1,
            status: result.status,
            headers: result.headers,
          });
          return result;
        } catch (error) {
          console.error('API call attempt failed:', {
            attempt: i + 1,
            errorMessage: error.message,
            status: error.response?.status,
            responseBody: JSON.stringify(error.response?.body, null, 2),
            headers: error.response?.headers,
          });
          if (i === maxRetries - 1) throw error;
          if (error.response?.status === 429) {
            console.log(`Rate limit hit. Retrying after ${delay * Math.pow(2, i)}ms`);
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
          } else {
            throw error;
          }
        }
      }
    };

    // Set inventory level
    console.log('Setting inventory level:', {
      inventoryItemId,
      locationId,
      available: parseInt(available),
    });
    const response = await retry(() =>
      client.post({
        path: 'inventory_levels/set.json',
        data: {
          location_id: parseInt(locationId),
          inventory_item_id: parseInt(inventoryItemId),
          available: parseInt(available),
        },
        type: DataType.JSON,
      })
    );

    // Log the inventory set response
    console.log('Shopify inventory set response:', {
      status: response.status,
      headers: response.headers,
      body: JSON.stringify(response.body, null, 2),
      apiCallLimit: Array.isArray(response.headers['x-shopify-shop-api-call-limit'])
        ? response.headers['x-shopify-shop-api-call-limit'][0]
        : response.headers['x-shopify-shop-api-call-limit'],
    });

    // Fetch the updated inventory level to confirm
    console.log('Fetching updated inventory level:', { inventoryItemId, locationId });
    let updatedInventory = { body: { inventory_levels: [] } };
    try {
      updatedInventory = await client.get({
        path: 'inventory_levels.json',
        query: { 
          inventory_item_ids: inventoryItemId, 
          location_ids: locationId 
        },
      });
      console.log('Fetched updated inventory:', {
        status: updatedInventory.status,
        headers: updatedInventory.headers,
        body: JSON.stringify(updatedInventory.body, null, 2),
        apiCallLimit: Array.isArray(updatedInventory.headers['x-shopify-shop-api-call-limit'])
          ? updatedInventory.headers['x-shopify-shop-api-call-limit'][0]
          : updatedInventory.headers['x-shopify-shop-api-call-limit'],
      });
    } catch (fetchError) {
      console.warn('Failed to fetch updated inventory:', {
        message: fetchError.message,
        stack: fetchError.stack,
        response: JSON.stringify(fetchError.response?.body, null, 2),
        status: fetchError.response?.status,
        headers: fetchError.response?.headers,
      });
      // Continue with response even if fetch fails
    }

    // Verify the response
    console.log('Verifying response:', {
      status: response.status,
      hasInventoryLevel: !!response.body?.inventory_level,
    });
    // Check if the response has a valid inventory_level object or a 2xx status
    if (
      (response.body?.inventory_level && response.body.inventory_level.available === parseInt(available)) ||
      (typeof response.status === 'number' && response.status >= 200 && response.status < 300)
    ) {
      console.log('Inventory update successful. Sending response.');
      res.status(200).json({
        success: true,
        data: response.body?.inventory_level || {},
        updatedInventory: updatedInventory.body?.inventory_levels || [],
        message: 'Inventory updated successfully',
      });
    } else {
      console.error('Invalid response or status code:', {
        status: response.status,
        body: JSON.stringify(response.body, null, 2),
      });
      throw new Error(`Invalid response or status code: ${response.status}`);
    }
  } catch (error) {
    console.error('Inventory update error:', {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      response: JSON.stringify(error.response?.body, null, 2),
      status: error.response?.status,
      headers: error.response?.headers,
    });

    const status = error.response?.status || 500;
    const errorDetails = error.response?.body?.errors || error.message;

    res.status(status).json({
      success: false,
      error: 'Failed to update inventory',
      details: errorDetails,
    });
  }
});

// Update product collections
app.put('/api/product-collections/:id', async (req, res) => {
  const productId = req.params.id;
  const { collections } = req.body;
  const session = res.locals.shopify.session;

  try {
    const client = new shopify.api.clients.Rest({ session });

    // Get current collects
    const currentCollects = await client.get({
      path: 'collects',
      query: { product_id: productId },
    });

    // Delete all existing collects
    const deletePromises = currentCollects.body.collects.map(collect =>
      client.delete({ path: `collects/${collect.id}` })
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
      return client.post({
        path: 'collects',
        data: {
          collect: {
            product_id: productId,
            collection_id: cleanCollectionId,
          },
        },
        type: DataType.JSON,
      });
    });
    const results = await Promise.all(createPromises);

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

// Update product
app.put('/api/products/:id', async (req, res) => {
  const productId = req.params.id;
  const { product } = req.body;

  const client = new shopify.api.clients.Rest({
    session: res.locals.shopify.session,
  });

  try {
    const updatedProduct = await client.put({
      path: `products/${productId}`,
      data: { product },
      type: DataType.JSON,
    });
    res.status(200).send(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', {
      message: error.message,
      response: error.response?.body,
    });
    res.status(400).json({ 
      error: 'Failed to update product',
      details: error.response?.body?.errors || error.message 
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

app.listen(PORT);