import express from "express";
import { readFileSync, writeFileSync } from "node:fs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const port = Number(process.env.PORT ?? 8787);
const serverOrigin = process.env.SERVER_ORIGIN ?? `http://localhost:${port}`;
const storePurchaseDeepLinkTemplate =
  process.env.STORE_PURCHASE_DEEPLINK ??
  `${serverOrigin}/store?productId={{productId}}&usePoints={{usePoints}}`;
const oauthEnabled = String(process.env.OAUTH_ENABLED ?? "false") === "true";
const oauthIssuer = process.env.OAUTH_ISSUER ?? "";
const oauthAudience = process.env.OAUTH_AUDIENCE ?? "";
const oauthJwksUri =
  process.env.OAUTH_JWKS_URI ??
  (oauthIssuer
    ? `${oauthIssuer.replace(/\/$/, "")}/.well-known/jwks.json`
    : "");

if (oauthEnabled && (!oauthIssuer || !oauthAudience || !oauthJwksUri)) {
  throw new Error(
    "OAuth is enabled but OAUTH_ISSUER, OAUTH_AUDIENCE or OAUTH_JWKS_URI is missing.",
  );
}

const oauthJwks = oauthEnabled
  ? createRemoteJWKSet(new URL(oauthJwksUri))
  : null;
const todoHtml = readFileSync("public/todo-widget.html", "utf8");
const rawStoreHtml = readFileSync("public/store.html", "utf8");
const rawProductDetailHtml = readFileSync("public/product-detail.html", "utf8");
const productsPath = "products.json";
const usersPath = "users.json";
function loadProducts() {
  return JSON.parse(readFileSync(productsPath, "utf8"));
}
function loadUsers() {
  return JSON.parse(readFileSync(usersPath, "utf8"));
}
function saveUsers(users) {
  writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf8");
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findProductByQuery(products, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  let best = null;
  let bestScore = 0;

  for (const product of products) {
    const normalizedName = normalizeText(product.name);
    const tokens = normalizedName
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1);
    let score = 0;

    if (normalizedName === normalizedQuery) score += 200;
    if (
      normalizedName.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedName)
    )
      score += 120;
    for (const token of tokens) {
      if (normalizedQuery.includes(token)) score += 20;
    }

    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : null;
}

function buildProductAnswer(product, query) {
  if (!product) {
    return `Nao encontrei um item para "${query}" na loja Itau.`;
  }

  const hasStock = product.stock > 0;
  return hasStock
    ? `Sim, temos ${product.name}. Preco: $${product.price.toFixed(2)}. Estoque: ${product.stock}. ${product.description}`
    : `Encontrei ${product.name}, mas no momento esta sem estoque. Preco: $${product.price.toFixed(2)}.`;
}

function processCoverCompetitorPrice(args) {
  const competitorPrice = Number(args?.competitorPrice);
  if (!Number.isFinite(competitorPrice) || competitorPrice <= 0) {
    const message =
      "Preco do concorrente invalido. Informe um valor numerico maior que zero.";
    return {
      canCover: false,
      product: null,
      competitorPrice: 0,
      coveredPrice: 0,
      discountApplied: 0,
      currency: args?.currency || "BRL",
      message,
    };
  }

  const products = loadProducts();
  const requestedId = args?.productId?.trim?.();
  const query = args?.productName?.trim?.();
  let product = null;

  if (requestedId) {
    product = products.find((p) => p.id === requestedId) ?? null;
  }
  if (!product && query) {
    product = findProductByQuery(products, query);
  }

  const coveredPrice = Number(Math.max(0, competitorPrice - 50).toFixed(2));
  const discountApplied = Number((competitorPrice - coveredPrice).toFixed(2));
  const currency = args?.currency?.trim?.() || "BRL";
  const store = args?.competitorStore?.trim?.();
  const productLabel = product?.name || query || "esse produto";
  const where = store ? " na loja " + store : "";
  const message =
    "Sim, podemos cobrir o valor de " +
    productLabel +
    where +
    ". Concorrente: " +
    currency +
    " " +
    competitorPrice.toFixed(2) +
    ". Nossa oferta: " +
    currency +
    " " +
    coveredPrice.toFixed(2) +
    " (" +
    currency +
    " " +
    discountApplied.toFixed(2) +
    " a menos).";

  return {
    canCover: true,
    product: product ?? null,
    competitorPrice: Number(competitorPrice.toFixed(2)),
    coveredPrice,
    discountApplied,
    currency,
    message,
  };
}

function processCoverFlightTrip(args) {
  const userId = args?.userId?.trim?.();
  const flightPrice = Number(args?.flightPrice);
  const origin = args?.origin?.trim?.() || "";
  const destination = args?.destination?.trim?.() || "";
  const airline = args?.airline?.trim?.() || "";
  const tripName = args?.tripName?.trim?.() || "";
  const pointsToRealRate = 0.5;

  if (!userId) {
    return {
      canCover: false,
      user: null,
      flightPrice: 0,
      pointsBalance: 0,
      pointsValueInReais: 0,
      pointsRequiredForFreeTrip: 0,
      pointsUsed: 0,
      remainingPoints: 0,
      totalPaid: 0,
      origin,
      destination,
      airline,
      tripName,
      message: "Informe o userId para calcular a cobertura da viagem.",
    };
  }

  if (!Number.isFinite(flightPrice) || flightPrice <= 0) {
    return {
      canCover: false,
      user: null,
      flightPrice: 0,
      pointsBalance: 0,
      pointsValueInReais: 0,
      pointsRequiredForFreeTrip: 0,
      pointsUsed: 0,
      remainingPoints: 0,
      totalPaid: 0,
      origin,
      destination,
      airline,
      tripName,
      message:
        "Preco da viagem invalido. Informe um valor numerico maior que zero.",
    };
  }

  const users = loadUsers();
  const user = users.find((entry) => entry.id === userId) ?? null;
  const pointsBalance = Number(user?.points || 0);
  const pointsValueInReais = Number(
    (pointsBalance * pointsToRealRate).toFixed(2),
  );
  const pointsRequiredForFreeTrip = Math.ceil(flightPrice / pointsToRealRate);
  const pointsUsed = Math.min(pointsBalance, pointsRequiredForFreeTrip);
  const remainingPoints = Math.max(0, pointsBalance - pointsUsed);
  const totalPaid = Number(
    Math.max(0, flightPrice - pointsValueInReais).toFixed(2),
  );
  const canCover = totalPaid === 0;
  const routeLabel =
    tripName ||
    (origin && destination ? `${origin} para ${destination}` : "essa viagem");
  const airlineLabel = airline ? ` na ${airline}` : "";

  const message = canCover
    ? "Sim, a viagem " +
      routeLabel +
      airlineLabel +
      " pode sair de graca. Voce tem " +
      pointsBalance +
      " pontos, equivalentes a R$ " +
      pointsValueInReais.toFixed(2) +
      ". O valor da passagem e R$ " +
      flightPrice.toFixed(2) +
      "."
    : "A viagem " +
      routeLabel +
      airlineLabel +
      " ainda nao sai de graca. Voce tem " +
      pointsBalance +
      " pontos, equivalentes a R$ " +
      pointsValueInReais.toFixed(2) +
      ". A passagem custa R$ " +
      flightPrice.toFixed(2) +
      ", entao faltam R$ " +
      Math.max(0, flightPrice - pointsValueInReais).toFixed(2) +
      ".";

  return {
    canCover,
    user,
    flightPrice: Number(flightPrice.toFixed(2)),
    pointsBalance,
    pointsValueInReais,
    pointsRequiredForFreeTrip,
    pointsUsed,
    remainingPoints,
    totalPaid,
    origin,
    destination,
    airline,
    tripName: routeLabel,
    message,
  };
}

function serializeForInlineScript(data) {
  return JSON.stringify(data ?? null).replace(/</g, "\\u003c");
}

function replaceTemplatePlaceholder(template, key, value) {
  return template.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
}

function buildProductDetailPage(
  productId = "",
  productData = null,
  userData = null,
) {
  return replaceTemplatePlaceholder(
    rawProductDetailHtml,
    "SERVER_ORIGIN",
    serverOrigin,
  )
    .replace(new RegExp("\\{\\{\\s*PRODUCT_ID\\s*\\}\\}", "g"), productId)
    .replace(
      new RegExp("\\{\\{\\s*PRODUCT_DATA\\s*\\}\\}", "g"),
      serializeForInlineScript(productData),
    )
    .replace(
      new RegExp("\\{\\{\\s*USER_DATA\\s*\\}\\}", "g"),
      serializeForInlineScript(userData),
    );
}

function buildStorePage() {
  return rawStoreHtml
    .replace(/\{\{SERVER_ORIGIN\}\}/g, serverOrigin)
    .replace(/\{\{STORE_PURCHASE_DEEPLINK\}\}/g, storePurchaseDeepLinkTemplate);
}

function toToolSafeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isProtectedPath(pathname) {
  return (
    pathname === MCP_PATH ||
    pathname === "/products" ||
    pathname === "/products/search" ||
    pathname.startsWith("/products/") ||
    pathname.startsWith("/users/") ||
    pathname === "/purchase" ||
    pathname === "/cover-competitor-price" ||
    pathname === "/cover-flight-trip"
  );
}

function readBearerToken(authorizationHeader = "") {
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function requireOAuth(req, res) {
  if (!oauthEnabled) return true;

  const token = readBearerToken(String(req.headers.authorization || ""));
  if (!token || !oauthJwks) {
    res
      .writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": 'Bearer realm="itau-ia-api"',
      })
      .end(JSON.stringify({ error: "missing bearer token" }));
    return false;
  }

  try {
    await jwtVerify(token, oauthJwks, {
      issuer: oauthIssuer,
      audience: oauthAudience,
    });
    return true;
  } catch (error) {
    res
      .writeHead(401, {
        "content-type": "application/json",
        "www-authenticate":
          'Bearer error="invalid_token", error_description="token validation failed"',
      })
      .end(JSON.stringify({ error: "invalid token" }));
    return false;
  }
}

const addTodoInputSchema = {
  title: z.string().min(1),
};

const completeTodoInputSchema = {
  id: z.string().min(1),
};

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  imageUrl: z.string(),
  stock: z.number(),
});

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  points: z.number(),
});

const todoOutputSchema = {
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      completed: z.boolean(),
    }),
  ),
};

let todos = [];
let nextId = 1;

const replyWithTodos = (message) => ({
  content: message ? [{ type: "text", text: message }] : [],
  structuredContent: { tasks: todos },
});

function createTodoServer() {
  const server = new McpServer({ name: "todo-app", version: "0.1.0" });

  registerAppResource(
    server,
    "todo-widget",
    "ui://widget/todo.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/todo.html",
          mimeType: RESOURCE_MIME_TYPE,
          text: todoHtml,
        },
      ],
    }),
  );

  // Store resource
  registerAppResource(
    server,
    "store-widget",
    "ui://widget/store.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/store.html",
          mimeType: RESOURCE_MIME_TYPE,
          text: buildStorePage(),
          _meta: {
            ui: {
              csp: {
                connectDomains: [serverOrigin],
                resourceDomains: [
                  serverOrigin,
                  "https://store.storeimages.cdn-apple.com",
                ],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppResource(
    server,
    "product-detail-widget",
    "ui://widget/product-detail.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/product-detail.html",
          mimeType: RESOURCE_MIME_TYPE,
          text: buildProductDetailPage("", null, null),
          _meta: {
            ui: {
              csp: {
                connectDomains: [serverOrigin],
                resourceDomains: [
                  "https://store.storeimages.cdn-apple.com",
                  "https://static0.pocketlintimages.com",
                ],
              },
            },
          },
        },
      ],
    }),
  );

  const productCatalog = loadProducts();
  const usersCatalog = loadUsers();
  const defaultUser =
    usersCatalog.find((u) => u.id === "user-1") ?? usersCatalog[0] ?? null;
  for (const item of productCatalog) {
    const resourceUri = `ui://widget/product/${item.id}.html`;
    registerAppResource(
      server,
      `product-${item.id}-widget`,
      resourceUri,
      {},
      async () => ({
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: buildProductDetailPage(item.id, item, defaultUser),
            _meta: {
              ui: {
                csp: {
                  connectDomains: [serverOrigin],
                  resourceDomains: [
                    "https://store.storeimages.cdn-apple.com",
                    "https://static0.pocketlintimages.com",
                  ],
                },
              },
            },
          },
        ],
      }),
    );
  }

  // Store tools: list products, get user, purchase
  registerAppTool(
    server,
    "list_products",
    {
      title: "List products",
      description:
        "Use when user asks to browse store products, catalog, itens disponiveis, or asks generally what can be bought",
      _meta: { ui: { resourceUri: "ui://widget/store.html" } },
      outputSchema: { products: z.array(productSchema) },
    },
    async () => {
      const products = loadProducts();
      return { content: [], structuredContent: { products } };
    },
  );

  registerAppTool(
    server,
    "search_product",
    {
      title: "Search product",
      description:
        "Use when user asks natural language shopping questions like 'quero um iphone', 'tem iphone?', 'quero comprar airpods'. Returns product match, details, and detailUrl",
      inputSchema: { query: z.string().min(1) },
      outputSchema: {
        query: z.string(),
        found: z.boolean(),
        product: z.union([productSchema, z.null()]),
        answer: z.string(),
        detailUrl: z.string().optional(),
      },
      _meta: { ui: { resourceUri: "ui://widget/store.html" } },
    },
    async (args) => {
      const query = args?.query?.trim?.() ?? "";
      if (!query) {
        return {
          content: [{ type: "text", text: "Pergunta vazia." }],
          structuredContent: {
            query: "",
            found: false,
            product: null,
            answer: "Pergunta vazia.",
          },
        };
      }

      const products = loadProducts();
      const product = findProductByQuery(products, query);
      const answer = buildProductAnswer(product, query);
      const detailUrl = product
        ? `${serverOrigin}/store/product/${product.id}`
        : undefined;

      return {
        content: [{ type: "text", text: answer }],
        structuredContent: {
          query,
          found: Boolean(product),
          product: product ?? null,
          answer,
          detailUrl,
        },
      };
    },
  );

  registerAppTool(
    server,
    "cover_competitor_price",
    {
      title: "Cover competitor price",
      description:
        "Use when user asks 'pode cobrir o valor desse produto?' and provides competitor price context. Covers competitor price with BRL 50 discount.",
      inputSchema: {
        competitorPrice: z.number().positive(),
        productName: z.string().optional(),
        productId: z.string().optional(),
        competitorStore: z.string().optional(),
        currency: z.string().optional(),
        context: z.string().optional(),
      },
      outputSchema: {
        canCover: z.boolean(),
        product: z.union([productSchema, z.null()]),
        competitorPrice: z.number(),
        coveredPrice: z.number(),
        discountApplied: z.number(),
        currency: z.string(),
        message: z.string(),
      },
      _meta: { ui: { resourceUri: "ui://widget/store.html" } },
    },
    async (args) => {
      const result = processCoverCompetitorPrice(args);
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: result,
      };
    },
  );

  registerAppTool(
    server,
    "cover_flight_trip",
    {
      title: "Cover flight trip",
      description:
        "Use when user asks about flight coverage, miles, points, free ticket, or how many points they have. Examples: 'quantas milhas tenho?', 'essa passagem sai de graca?', 'posso viajar usando pontos?'. Treat 3000 points as worth R$ 1500, so some flights can be fully covered.",
      inputSchema: {
        userId: z.string().min(1),
        flightPrice: z.number().positive(),
        origin: z.string().optional(),
        destination: z.string().optional(),
        airline: z.string().optional(),
        tripName: z.string().optional(),
      },
      outputSchema: {
        canCover: z.boolean(),
        user: z.union([userSchema, z.null()]),
        flightPrice: z.number(),
        pointsBalance: z.number(),
        pointsValueInReais: z.number(),
        pointsRequiredForFreeTrip: z.number(),
        pointsUsed: z.number(),
        remainingPoints: z.number(),
        totalPaid: z.number(),
        origin: z.string(),
        destination: z.string(),
        airline: z.string(),
        tripName: z.string(),
        message: z.string(),
      },
      _meta: { ui: { resourceUri: "ui://widget/store.html" } },
    },
    async (args) => {
      const result = processCoverFlightTrip(args);
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: result,
      };
    },
  );

  registerAppTool(
    server,
    "open_product_detail",
    {
      title: "Open product detail",
      description:
        "Use when user wants product details page/screen. Opens dedicated product detail screen by productId or natural-language query",
      inputSchema: {
        productId: z.string().optional(),
        query: z.string().optional(),
      },
      outputSchema: {
        found: z.boolean(),
        product: z.union([productSchema, z.null()]),
        detailUrl: z.string().optional(),
      },
      _meta: { ui: { resourceUri: "ui://widget/product-detail.html" } },
    },
    async (args) => {
      const products = loadProducts();
      const requestedId = args?.productId?.trim?.();
      const query = args?.query?.trim?.();

      let product = null;
      if (requestedId) {
        product = products.find((p) => p.id === requestedId) ?? null;
      }
      if (!product && query) {
        product = findProductByQuery(products, query);
      }

      if (!product) {
        return {
          content: [
            {
              type: "text",
              text: "Produto nao encontrado para abrir detalhes.",
            },
          ],
          structuredContent: { found: false, product: null },
        };
      }

      const detailUrl = `${serverOrigin}/store/product/${product.id}`;
      return {
        content: [
          {
            type: "text",
            text: `Abrindo detalhes de ${product.name}: ${detailUrl}`,
          },
        ],
        structuredContent: { found: true, product, detailUrl },
      };
    },
  );

  for (const item of productCatalog) {
    const resourceUri = `ui://widget/product/${item.id}.html`;
    registerAppTool(
      server,
      `open_${toToolSafeName(item.id)}_detail`,
      {
        title: `Open ${item.name} detail`,
        description: `Opens dedicated detail screen for ${item.name}`,
        outputSchema: {
          found: z.boolean(),
          product: productSchema,
          detailUrl: z.string(),
        },
        _meta: { ui: { resourceUri } },
      },
      async () => {
        const detailUrl = `${serverOrigin}/store/product/${item.id}`;
        return {
          content: [
            {
              type: "text",
              text: `Detalhes de ${item.name} disponiveis em ${detailUrl}`,
            },
          ],
          structuredContent: { found: true, product: item, detailUrl },
        };
      },
    );
  }

  registerAppTool(
    server,
    "get_user",
    {
      title: "Get user",
      description: "Returns user data including points",
      inputSchema: { id: z.string() },
      outputSchema: { user: userSchema },
      _meta: { ui: { resourceUri: "ui://widget/store.html" } },
    },
    async (args) => {
      const id = args?.id;
      const users = loadUsers();
      const user = users.find((u) => u.id === id);
      return { content: [], structuredContent: { user } };
    },
  );

  registerAppTool(
    server,
    "purchase_product",
    {
      title: "Purchase product",
      description:
        "Use when user confirms purchase intent (ex: 'comprar agora', 'finalizar compra'). Purchases product and applies points discount if requested",
      inputSchema: {
        userId: z.string(),
        productId: z.string(),
        usePoints: z.boolean().optional(),
      },
      outputSchema: {
        productId: z.string(),
        totalPaid: z.number(),
        discountPercent: z.number(),
        user: userSchema,
      },
      _meta: { ui: { resourceUri: "ui://widget/store.html" } },
    },
    async (args) => {
      const { userId, productId, usePoints } = args || {};
      if (!userId || !productId) {
        return {
          content: [{ type: "text", text: "Missing userId or productId" }],
        };
      }
      const products = loadProducts();
      const users = loadUsers();
      const product = products.find((p) => p.id === productId);
      const user = users.find((u) => u.id === userId);
      if (!product)
        return { content: [{ type: "text", text: "Product not found" }] };
      if (!user) return { content: [{ type: "text", text: "User not found" }] };

      // Points program: each full 100 points = 5% discount, up to 20%
      const blocks = Math.floor(user.points / 100);
      const discountPercent = Math.min(20, blocks * 5);
      const discount = usePoints ? (product.price * discountPercent) / 100 : 0;
      const totalPaid = Math.max(0, product.price - discount);

      // If using points, consume the used full hundreds
      if (usePoints && blocks > 0) {
        const pointsToConsume = blocks * 100;
        user.points = Math.max(0, user.points - pointsToConsume);
      }

      // Earn points: 1 point per whole dollar spent
      const pointsEarned = Math.floor(totalPaid);
      user.points = (user.points || 0) + pointsEarned;

      saveUsers(users);

      return {
        content: [{ type: "text", text: `Purchased ${product.name}` }],
        structuredContent: { productId, totalPaid, discountPercent, user },
      };
    },
  );

  registerAppTool(
    server,
    "add_todo",
    {
      title: "Add todo",
      description: "Creates a todo item with the given title.",
      inputSchema: addTodoInputSchema,
      outputSchema: todoOutputSchema,
      _meta: {
        ui: { resourceUri: "ui://widget/todo.html" },
      },
    },
    async (args) => {
      const title = args?.title?.trim?.() ?? "";
      if (!title) return replyWithTodos("Missing title.");
      const todo = { id: `todo-${nextId++}`, title, completed: false };
      todos = [...todos, todo];
      return replyWithTodos(`Added "${todo.title}".`);
    },
  );

  registerAppTool(
    server,
    "complete_todo",
    {
      title: "Complete todo",
      description: "Marks a todo as done by id.",
      inputSchema: completeTodoInputSchema,
      outputSchema: todoOutputSchema,
      _meta: {
        ui: { resourceUri: "ui://widget/todo.html" },
      },
    },
    async (args) => {
      const id = args?.id;
      if (!id) return replyWithTodos("Missing todo id.");
      const todo = todos.find((task) => task.id === id);
      if (!todo) {
        return replyWithTodos(`Todo ${id} was not found.`);
      }

      todos = todos.map((task) =>
        task.id === id ? { ...task, completed: true } : task,
      );

      return replyWithTodos(`Completed "${todo.title}".`);
    },
  );

  return server;
}

const MCP_PATH = "/mcp";

const app = express();

app.use("/assets", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use("/assets", express.static("public/assets"));

app.options(MCP_PATH, (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, mcp-session-id",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.status(204).end();
});

app.options(
  [
    "/products",
    "/products/search",
    "/products/*",
    "/users/*",
    "/purchase",
    "/cover-flight-trip",
    "/cover-competitor-price",
  ],
  (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization, content-type",
    );
    res.status(204).end();
  },
);

app.use(async (req, res, next) => {
  if (isProtectedPath(req.path) && req.method !== "OPTIONS") {
    const authorized = await requireOAuth(req, res);
    if (!authorized) return;
  }
  next();
});

app.get("/", (_req, res) => {
  res.type("text/plain").status(200).send("Todo MCP server");
});

app.get("/store", (_req, res) => {
  res.type("text/html").status(200).send(buildStorePage());
});

app.get("/store.html", (_req, res) => {
  res.type("text/html").status(200).send(buildStorePage());
});

app.get("/store/product.html", (req, res) => {
  const productId = String(req.query.id || "").trim();
  const products = loadProducts();
  const users = loadUsers();
  const product = products.find((p) => p.id === productId) ?? null;
  const defaultUser = users.find((u) => u.id === "user-1") ?? users[0] ?? null;
  res
    .type("text/html")
    .status(200)
    .send(buildProductDetailPage(productId, product, defaultUser));
});

app.get("/store/product/:id", (req, res) => {
  const productId = String(req.params.id || "").trim();
  const products = loadProducts();
  const users = loadUsers();
  const product = products.find((p) => p.id === productId) ?? null;
  const defaultUser = users.find((u) => u.id === "user-1") ?? users[0] ?? null;
  res
    .type("text/html")
    .status(200)
    .send(buildProductDetailPage(productId, product, defaultUser));
});

app.get("/products/search", (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const query = String(req.query.q || "").trim();
    if (!query) {
      res.status(400).json({ error: "missing query" });
      return;
    }

    const products = loadProducts();
    const product = findProductByQuery(products, query);
    const answer = buildProductAnswer(product, query);
    res.status(200).json({
      query,
      found: Boolean(product),
      product: product ?? null,
      answer,
    });
  } catch (err) {
    res.status(500).json({ error: "failed to search products" });
  }
});

app.get("/products/:id", (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const id = req.params.id;
    const products = loadProducts();
    const product = products.find((p) => p.id === id);
    if (!product) {
      res.status(404).json({ error: "product not found" });
      return;
    }
    res.status(200).json(product);
  } catch (err) {
    res.status(500).json({ error: "failed to load product" });
  }
});

app.get("/products", (_req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const products = loadProducts();
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ error: "failed to load products" });
  }
});

app.get("/users/:id", (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const id = req.params.id;
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: "failed to load user" });
  }
});

app.post("/purchase", express.json(), (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    const { userId, productId, usePoints } = req.body || {};
    if (!userId || !productId) {
      res.status(400).json({ error: "missing userId or productId" });
      return;
    }

    const products = loadProducts();
    const users = loadUsers();
    const product = products.find((p) => p.id === productId);
    const user = users.find((u) => u.id === userId);
    if (!product) {
      res.status(404).json({ error: "product not found" });
      return;
    }
    if (!user) {
      res.status(404).json({ error: "user not found" });
      return;
    }

    const blocks = Math.floor(user.points / 100);
    const discountPercent = Math.min(20, blocks * 5);
    const discount = usePoints ? (product.price * discountPercent) / 100 : 0;
    const totalPaid = Math.max(0, product.price - discount);

    if (usePoints && blocks > 0) {
      const pointsToConsume = blocks * 100;
      user.points = Math.max(0, user.points - pointsToConsume);
    }
    const pointsEarned = Math.floor(totalPaid);
    user.points = (user.points || 0) + pointsEarned;
    saveUsers(users);

    res.status(200).json({ productId, totalPaid, discountPercent, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "purchase failed" });
  }
});

app.post("/cover-competitor-price", express.json(), (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");

    const result = processCoverCompetitorPrice(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "cover price check failed" });
  }
});

app.post("/cover-flight-trip", express.json(), (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");

    const result = processCoverFlightTrip(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "cover flight check failed" });
  }
});

app.all(MCP_PATH, async (req, res) => {
  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (!MCP_METHODS.has(req.method)) {
    res.status(405).send("Method Not Allowed");
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  const server = createTodoServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

app.use((_req, res) => {
  res.status(404).send("Not Found");
});

app.listen(port, () => {
  console.log(
    `Todo MCP server listening on http://localhost:${port}${MCP_PATH}`,
  );
});
