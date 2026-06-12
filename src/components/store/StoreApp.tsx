import React, { useMemo, useState } from "react";
import type { Product } from "../../types";
import { currency } from "../../utils/currency";
import { apiOrigin, buildPurchaseLink } from "../../utils/urls";
import ProductCard from "./ProductCard";
import PurchaseModal from "./PurchaseModal";

export default function StoreApp() {
  const [query, setQuery] = useState("");
  const [searchAnswer, setSearchAnswer] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackKind, setFeedbackKind] = useState<"ok" | "err">("ok");
  const [modalOpen, setModalOpen] = useState(false);
  const [purchaseWithPoints, setPurchaseWithPoints] = useState(false);

  // Cover competitor price states
  const [showCoverForm, setShowCoverForm] = useState(false);
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [competitorStore, setCompetitorStore] = useState("");
  const [coverResult, setCoverResult] = useState<any>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  const detailUrl = useMemo(() => {
    if (!selected) return "";
    return `${apiOrigin}/store/product/${selected.id}`;
  }, [selected]);

  async function askProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;

    setBusy(true);
    setFeedback("");
    setSearchAnswer("");

    try {
      const response = await fetch(
        `${apiOrigin}/products/search?q=${encodeURIComponent(text)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Falha na busca");
      }

      setSearchAnswer(data.answer || "Busca concluída.");
      setSelected(data.product || null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível buscar produtos.";
      setSearchAnswer(message);
      setSelected(null);
      setFeedbackKind("err");
      setFeedback(message);
    } finally {
      setBusy(false);
    }
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

  async function handleCoverCompetitorPrice(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const price = parseFloat(competitorPrice.trim());

    if (!price || price <= 0) {
      setFeedbackKind("err");
      setFeedback("Por favor, informe um preço válido.");
      return;
    }

    setCoverBusy(true);
    setFeedbackKind("ok");
    setFeedback("Analisando preço do concorrente...");
    setCoverResult(null);

    try {
      // Call the HTTP endpoint directly
      const response = await fetch(`${apiOrigin}/cover-competitor-price`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          competitorPrice: price,
          productName: selected?.name,
          productId: selected?.id,
          competitorStore: competitorStore.trim() || undefined,
          currency: "BRL",
        }),
      });

      console.log("Cover Response Status:", response.status);
      const result = await response.json();
      console.log("Cover Result:", result);

      if (!response.ok) {
        throw new Error(result.error || "Erro ao processar cobertura");
      }

      if (result && result.canCover) {
        setCoverResult(result);
        setFeedbackKind("ok");
        setFeedback("");
        setShowCoverForm(false);
      } else if (result) {
        setFeedbackKind("err");
        setFeedback(result.message || "Não foi possível cobrir esse preço.");
        setCoverResult(null);
      } else {
        throw new Error("Resposta inesperada do servidor");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao processar cobertura";
      console.error("Cover Competitor Price Error:", error);
      setFeedbackKind("err");
      setFeedback(message);
      setCoverResult(null);
    } finally {
      setCoverBusy(false);
    }
  }

  function clearCoverResult() {
    setCoverResult(null);
    setCompetitorPrice("");
    setCompetitorStore("");
    setShowCoverForm(false);
    setFeedback("");
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex: Quero comprar um iPhone"
          />
          <button disabled={busy} type="submit">
            {busy ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {searchAnswer ? <p className="answer">{searchAnswer}</p> : null}

        {selected ? (
          <ProductCard
            product={selected}
            busy={busy}
            detailUrl={detailUrl}
            onPurchase={goToStorePurchase}
          />
        ) : null}

        {feedback ? (
          <p className={feedbackKind === "ok" ? "feedback ok" : "feedback err"}>
            {feedback}
          </p>
        ) : null}

        {/* Cover Competitor Price Form */}
        {!coverResult && !showCoverForm && selected ? (
          <button className="cover-btn" onClick={() => setShowCoverForm(true)}>
            Pode cobrir o preço do concorrente?
          </button>
        ) : null}

        {showCoverForm ? (
          <form className="cover-form" onSubmit={handleCoverCompetitorPrice}>
            <div className="form-group">
              <label>Preço do Concorrente (BRL)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={competitorPrice}
                onChange={(e) => setCompetitorPrice(e.target.value)}
                placeholder="Ex: 1.999,99"
                required
              />
            </div>
            <div className="form-group">
              <label>Loja do Concorrente (Opcional)</label>
              <input
                type="text"
                value={competitorStore}
                onChange={(e) => setCompetitorStore(e.target.value)}
                placeholder="Ex: Mercado Livre"
              />
            </div>
            <div className="form-actions">
              <button
                type="submit"
                disabled={coverBusy}
                className="primary-btn"
              >
                {coverBusy ? "Verificando..." : "Verificar Cobertura"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCoverForm(false);
                  setCompetitorPrice("");
                  setCompetitorStore("");
                }}
                className="secondary-btn"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {/* Cover Result - Visual Message */}
        {coverResult?.canCover ? (
          <div className="cover-result success">
            <div className="cover-success-badge">✓</div>
            <h2>Podemos Cobrir!</h2>

            <div className="cover-details">
              {coverResult.product && (
                <div className="detail-item">
                  <span className="label">Produto:</span>
                  <span className="value">{coverResult.product.name}</span>
                </div>
              )}

              <div className="detail-item">
                <span className="label">Preço do Concorrente:</span>
                <span className="value original">
                  {coverResult.currency}{" "}
                  {coverResult.competitorPrice.toFixed(2)}
                </span>
              </div>

              <div className="detail-item highlight">
                <span className="label">Nossa Oferta:</span>
                <span className="value price-highlight">
                  {coverResult.currency} {coverResult.coveredPrice.toFixed(2)}
                </span>
              </div>

              <div className="detail-item discount">
                <span className="label">Você Economiza:</span>
                <span className="value savings">
                  {coverResult.currency}{" "}
                  {coverResult.discountApplied.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="cover-actions">
              <button
                className="primary-btn"
                onClick={() => goToStorePurchase(false)}
              >
                Comprar com Desconto
              </button>
              <button className="secondary-btn" onClick={clearCoverResult}>
                Fazer Outra Busca
              </button>
            </div>
          </div>
        ) : null}

        {modalOpen ? (
          <PurchaseModal
            productName={selected?.name ?? "produto"}
            onCancel={closePurchaseModal}
            onConfirm={confirmPurchase}
          />
        ) : null}
      </main>
    </div>
  );
}
