import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
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

function serializeForInlineScript(data) {
  return JSON.stringify(data ?? null).replace(/</g, "\\u003c");
}

function buildProductDetailPage(
  productId = "",
  productData = null,
  userData = null,
) {
  return rawProductDetailHtml
    .replace(/\{\{SERVER_ORIGIN\}\}/g, serverOrigin)
    .replace(/\{\{PRODUCT_ID\}\}/g, productId)
    .replace(/\{\{PRODUCT_DATA\}\}/g, serializeForInlineScript(productData))
    .replace(/\{\{USER_DATA\}\}/g, serializeForInlineScript(userData));
}

function toToolSafeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
          text: rawStoreHtml.replace(/\{\{SERVER_ORIGIN\}\}/g, serverOrigin),
          _meta: {
            ui: {
              csp: {
                connectDomains: [serverOrigin],
                resourceDomains: ["https://store.storeimages.cdn-apple.com"],
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

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (
    req.method === "OPTIONS" &&
    (url.pathname === "/products" ||
      url.pathname === "/products/search" ||
      url.pathname.startsWith("/products/") ||
      url.pathname.startsWith("/users/") ||
      url.pathname === "/purchase")
  ) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/products/search") {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const query = (url.searchParams.get("q") || "").trim();
      if (!query) {
        res
          .writeHead(400, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "missing query" }));
        return;
      }

      const products = loadProducts();
      const product = findProductByQuery(products, query);
      const answer = buildProductAnswer(product, query);
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          query,
          found: Boolean(product),
          product: product ?? null,
          answer,
        }),
      );
    } catch (err) {
      res
        .writeHead(500)
        .end(JSON.stringify({ error: "failed to search products" }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/products/")) {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const id = url.pathname.split("/").pop();
      const products = loadProducts();
      const product = products.find((p) => p.id === id);
      if (!product) {
        res
          .writeHead(404, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "product not found" }));
        return;
      }
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(product));
    } catch (err) {
      res
        .writeHead(500)
        .end(JSON.stringify({ error: "failed to load product" }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end("Todo MCP server");
    return;
  }

  // Serve store UI
  if (
    req.method === "GET" &&
    (url.pathname === "/store" || url.pathname === "/store.html")
  ) {
    res
      .writeHead(200, { "content-type": "text/html" })
      .end(rawStoreHtml.replace(/\{\{SERVER_ORIGIN\}\}/g, serverOrigin));
    return;
  }

  if (req.method === "GET" && url.pathname === "/store/product.html") {
    const productId = (url.searchParams.get("id") || "").trim();
    const products = loadProducts();
    const users = loadUsers();
    const product = products.find((p) => p.id === productId) ?? null;
    const defaultUser =
      users.find((u) => u.id === "user-1") ?? users[0] ?? null;
    res
      .writeHead(200, { "content-type": "text/html" })
      .end(buildProductDetailPage(productId, product, defaultUser));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/store/product/")) {
    const productId = (url.pathname.split("/").pop() || "").trim();
    const products = loadProducts();
    const users = loadUsers();
    const product = products.find((p) => p.id === productId) ?? null;
    const defaultUser =
      users.find((u) => u.id === "user-1") ?? users[0] ?? null;
    res
      .writeHead(200, { "content-type": "text/html" })
      .end(buildProductDetailPage(productId, product, defaultUser));
    return;
  }

  // API to list products
  if (req.method === "GET" && url.pathname === "/products") {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const products = loadProducts();
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(products));
    } catch (err) {
      res
        .writeHead(500)
        .end(JSON.stringify({ error: "failed to load products" }));
    }
    return;
  }

  // API to get user by id
  if (req.method === "GET" && url.pathname.startsWith("/users/")) {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const id = url.pathname.split("/").pop();
      const users = loadUsers();
      const user = users.find((u) => u.id === id);
      if (!user) {
        res
          .writeHead(404, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "user not found" }));
        return;
      }
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(user));
    } catch (err) {
      res.writeHead(500).end(JSON.stringify({ error: "failed to load user" }));
    }
    return;
  }

  // Purchase endpoint
  if (req.method === "POST" && url.pathname === "/purchase") {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      let body = "";
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body || "{}");
      const { userId, productId, usePoints } = data;
      if (!userId || !productId) {
        res
          .writeHead(400, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "missing userId or productId" }));
        return;
      }

      const products = loadProducts();
      const users = loadUsers();
      const product = products.find((p) => p.id === productId);
      const user = users.find((u) => u.id === userId);
      if (!product) {
        res
          .writeHead(404, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "product not found" }));
        return;
      }
      if (!user) {
        res
          .writeHead(404, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "user not found" }));
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

      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ productId, totalPaid, discountPercent, user }));
    } catch (err) {
      console.error(err);
      res
        .writeHead(500, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "purchase failed" }));
    }
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
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
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(
    `Todo MCP server listening on http://localhost:${port}${MCP_PATH}`,
  );
});
