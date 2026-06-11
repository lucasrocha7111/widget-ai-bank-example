# bank-ia-api

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## OAuth 2.0 (Bearer JWT)

The server supports optional OAuth validation for `/mcp` and API endpoints (`/products*`, `/users/*`, `/purchase`).

1. Install dependencies:

```bash
bun install
```

2. Configure environment variables:

```bash
export OAUTH_ENABLED=true
export OAUTH_ISSUER="https://YOUR_ISSUER"
export OAUTH_AUDIENCE="YOUR_API_AUDIENCE"
# Optional. If not set, defaults to: $OAUTH_ISSUER/.well-known/jwks.json
export OAUTH_JWKS_URI="https://YOUR_ISSUER/.well-known/jwks.json"
```

3. Start the server:

```bash
bun run index.ts
```

4. Call endpoints with `Authorization: Bearer <token>`:

```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8787/products
```

### MCP Inspector with OAuth

When OAuth is enabled, include the bearer token header in Inspector requests.

```bash
npx @modelcontextprotocol/inspector@latest --server-url http://localhost:8787/mcp --transport http
```

Then add header:

```text
Authorization: Bearer <TOKEN>
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
