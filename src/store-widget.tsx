import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  stock: number;
};

declare global {
  interface Window {
    __SERVER_ORIGIN?: string;
    __STORE_PURCHASE_DEEPLINK?: string;
  }
}

const serverOrigin = (window.__SERVER_ORIGIN || "").replace(/\/$/, "");
const apiOrigin = serverOrigin || window.location.origin;
const purchaseDeepLinkTemplate =
  window.__STORE_PURCHASE_DEEPLINK ||
  `${apiOrigin}/store?productId={{productId}}&usePoints={{usePoints}}`;

function currency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function App() {
  const [query, setQuery] = useState("");
  const [searchAnswer, setSearchAnswer] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "err">("ok");
  const [modalOpen, setModalOpen] = useState(false);
  const [purchaseWithPoints, setPurchaseWithPoints] = useState(false);

  const detailUrl = useMemo(() => {
    if (!selected) return "";
    return `${apiOrigin}/store/product/${selected.id}`;
  }, [selected]);

  function buildPurchaseLink(productId: string, usePoints: boolean): string {
    let url = purchaseDeepLinkTemplate;

    if (url.includes("{{productId}}")) {
      url = url.replaceAll("{{productId}}", encodeURIComponent(productId));
    } else {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}productId=${encodeURIComponent(productId)}`;
    }

    if (url.includes("{{usePoints}}")) {
      url = url.replaceAll("{{usePoints}}", usePoints ? "1" : "0");
    }

    return url;
  }

  function goToStorePurchase(usePoints: boolean) {
    if (!selected) return;
    setPurchaseWithPoints(usePoints);
    setModalOpen(true);
  }

  function closePurchaseModal() {
    setModalOpen(false);
  }

  function confirmPurchase() {
    if (!selected) return;
    const link = buildPurchaseLink(selected.id, purchaseWithPoints);
    setFeedbackKind("ok");
    setFeedback("Redirecionando para finalizar a compra no app...");
    setModalOpen(false);

    window.open(link, "_blank", "noopener,noreferrer");
  }

  async function askProduct(event: React.FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;

    setBusy(true);
    setFeedback("");

    try {
      const response = await fetch(
        `${apiOrigin}/products/search?q=${encodeURIComponent(text)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Falha na busca");
      }

      setSearchAnswer(data.answer || "Busca concluida.");
      setSelected(data.product || null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel buscar produtos.";
      setSearchAnswer(message);
      setSelected(null);
      setFeedbackKind("err");
      setFeedback(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="hero">
        <p className="kicker">Itau Benefits</p>
        <h1>Loja com pontos no app</h1>
        <p>
          Pesquise por linguagem natural e finalize com desconto por pontos.
        </p>
      </header>

      <main className="card">
        <form className="search" onSubmit={askProduct}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: Quero comprar um iPhone"
          />
          <button disabled={busy} type="submit">
            {busy ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {searchAnswer ? <p className="answer">{searchAnswer}</p> : null}

        {selected ? (
          <section className="product">
            <img alt={selected.name} src={selected.imageUrl} />
            <div>
              <h2>{selected.name}</h2>
              <p>{selected.description}</p>
              <p className="price">{currency(selected.price)}</p>
              <p className="stock">Estoque: {selected.stock}</p>

              <div className="actions">
                <button
                  type="button"
                  disabled={busy || selected.stock <= 0}
                  onClick={() => goToStorePurchase(false)}
                >
                  Comprar
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || selected.stock <= 0}
                  onClick={() => goToStorePurchase(true)}
                >
                  Comprar com pontos
                </button>
                <a href={detailUrl} target="_blank" rel="noreferrer">
                  Ver detalhes
                </a>
              </div>
            </div>
          </section>
        ) : null}

        {feedback ? (
          <p className={feedbackKind === "ok" ? "feedback ok" : "feedback err"}>
            {feedback}
          </p>
        ) : null}

        {modalOpen ? (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal-card">
              <h3>Confirmar compra</h3>
              <p>
                Voce sera redirecionado para o app Itau para concluir a compra de
                {" "}
                <strong>{selected?.name}</strong>.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closePurchaseModal}
                >
                  Nao
                </button>
                <button type="button" onClick={confirmPurchase}>
                  Sim, continuar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
