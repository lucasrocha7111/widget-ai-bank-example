/// <reference types="bun" />

const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/v1/widget/status") {
      const acoes = {
        saldo: "R$ 7.550,00",
        status: "Conta Aberta",
        investimentos: 3,
        ultima_transacao: "Há 10 min por Lucas Mota",
        acoes: ["transferir pix", "pagar fatura", "investir em ações"],
      };

      return Response.json(acoes, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      });
    }

    return new Response("Hello, World!");
  },
});

console.log(`Server running at http://localhost:${server.port}`);
