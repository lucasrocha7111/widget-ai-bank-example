import React, { useEffect, useMemo, useState } from "react";
import type { Product } from "../../types";
import { currency } from "../../utils/currency";
import {
  apiOrigin,
  defaultUserId,
  purchaseAuthDeepLink,
} from "../../utils/urls";
import ProductCard from "./ProductCard";
import PurchaseModal from "./PurchaseModal";

type InvestmentItem = {
  id: string;
  name: string;
  category: string;
  investedAmount: number;
  currentValue: number;
  profitability: string;
  annualYield?: string;
  liquidity?: string;
};

type BankAccountPortfolio = {
  bank: string;
  accountType: string;
  balance: number;
  currency: string;
  investedAmount?: number;
  currentInvestmentValue?: number;
  investments: InvestmentItem[];
};

type OpenBankingInfo = {
  enabled: boolean;
  connectedBanks: string[];
  permissions: string[];
};

type InvestmentPortfolioResponse = {
  found: boolean;
  openBanking: OpenBankingInfo | null;
  accounts: BankAccountPortfolio[];
  cashBalance: number;
  investedAmount: number;
  currentInvestmentValue: number;
  consolidatedAssets: number;
  message: string;
};

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

  const [showFlightForm, setShowFlightForm] = useState(false);
  const [flightPrice, setFlightPrice] = useState("");
  const [flightOrigin, setFlightOrigin] = useState("");
  const [flightDestination, setFlightDestination] = useState("");
  const [flightAirline, setFlightAirline] = useState("");
  const [flightResult, setFlightResult] = useState<any>(null);
  const [flightBusy, setFlightBusy] = useState(false);
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [portfolio, setPortfolio] =
    useState<InvestmentPortfolioResponse | null>(null);
  const [portfolioBusy, setPortfolioBusy] = useState(true);
  const [portfolioError, setPortfolioError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadUserPoints() {
      try {
        const response = await fetch(`${apiOrigin}/users/${defaultUserId}`);
        const data = await response.json();

        if (!active || !response.ok) return;

        setUserPoints(Number(data?.points ?? 0));
      } catch {
        if (active) setUserPoints(0);
      } finally {
        if (active) setUserLoading(false);
      }
    }

    loadUserPoints();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInvestments() {
      setPortfolioBusy(true);
      setPortfolioError("");

      try {
        const response = await fetch(
          `${apiOrigin}/users/${defaultUserId}/investments`,
        );
        const data = await response.json();

        if (!active) return;

        if (!response.ok || !data?.found) {
          throw new Error(
            data?.error || "Não foi possível carregar investimentos.",
          );
        }

        setPortfolio(data);
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Erro ao carregar investimentos.";
        setPortfolioError(message);
        setPortfolio(null);
      } finally {
        if (active) {
          setPortfolioBusy(false);
        }
      }
    }

    loadInvestments();

    return () => {
      active = false;
    };
  }, []);

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

    setFeedbackKind("ok");
    setFeedback("Abrindo autenticacao no app BankPOC...");
    setModalOpen(false);
    window.location.href = purchaseAuthDeepLink;
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

  async function handleFlightCoverage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = parseFloat(flightPrice.trim());

    if (!price || price <= 0) {
      setFeedbackKind("err");
      setFeedback("Por favor, informe o valor da passagem.");
      return;
    }

    setFlightBusy(true);
    setFeedbackKind("ok");
    setFeedback("Calculando cobertura da passagem...");
    setFlightResult(null);

    try {
      const response = await fetch(`${apiOrigin}/cover-flight-trip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: defaultUserId,
          flightPrice: price,
          origin: flightOrigin.trim() || undefined,
          destination: flightDestination.trim() || undefined,
          airline: flightAirline.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao processar a viagem");
      }

      if (result && result.canCover !== undefined) {
        setFlightResult(result);
        setFeedbackKind("ok");
        setFeedback("");
        setShowFlightForm(false);
      } else {
        throw new Error("Resposta inesperada do servidor");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao processar a viagem";
      setFeedbackKind("err");
      setFeedback(message);
      setFlightResult(null);
    } finally {
      setFlightBusy(false);
    }
  }

  function clearFlightResult() {
    setFlightResult(null);
    setFlightPrice("");
    setFlightOrigin("");
    setFlightDestination("");
    setFlightAirline("");
    setShowFlightForm(false);
    setFeedback("");
  }

  async function reloadPortfolio() {
    setPortfolioBusy(true);
    setPortfolioError("");

    try {
      const response = await fetch(
        `${apiOrigin}/users/${defaultUserId}/investments`,
      );
      const data = await response.json();

      if (!response.ok || !data?.found) {
        throw new Error(
          data?.error || "Não foi possível atualizar investimentos.",
        );
      }

      setPortfolio(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao atualizar investimentos.";
      setPortfolioError(message);
    } finally {
      setPortfolioBusy(false);
    }
  }

  const pointsLabel = userLoading
    ? "carregando..."
    : `${userPoints ?? 0} pontos`;
  const pointsValueLabel = userLoading
    ? "R$ 0,00"
    : currency((userPoints ?? 0) * 0.5);

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

        <section className="invest-shell">
          <div className="invest-head">
            <div>
              <p className="invest-kicker">Open Finance</p>
              <h2>Carteira de investimentos</h2>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={reloadPortfolio}
              disabled={portfolioBusy}
            >
              {portfolioBusy ? "Atualizando..." : "Atualizar dados"}
            </button>
          </div>

          {portfolio?.openBanking?.enabled ? (
            <div className="ob-pill-row">
              <span className="ob-pill">OpenBanking ativo</span>
              {portfolio.openBanking.connectedBanks.map((bank) => (
                <span key={bank} className="ob-pill muted">
                  {bank}
                </span>
              ))}
            </div>
          ) : null}

          {portfolioBusy ? (
            <p className="invest-note">Carregando carteira...</p>
          ) : null}
          {portfolioError ? (
            <p className="feedback err">{portfolioError}</p>
          ) : null}

          {portfolio ? (
            <>
              <div className="invest-summary-grid">
                <div className="invest-summary-card">
                  <span>Saldo em conta</span>
                  <strong>{currency(portfolio.cashBalance)}</strong>
                </div>
                <div className="invest-summary-card">
                  <span>Total investido</span>
                  <strong>{currency(portfolio.investedAmount)}</strong>
                </div>
                <div className="invest-summary-card">
                  <span>Valor atual dos investimentos</span>
                  <strong>{currency(portfolio.currentInvestmentValue)}</strong>
                </div>
                <div className="invest-summary-card highlight">
                  <span>Patrimônio consolidado</span>
                  <strong>{currency(portfolio.consolidatedAssets)}</strong>
                </div>
              </div>

              <div className="bank-grid">
                {portfolio.accounts.map((account) => (
                  <article
                    key={`${account.bank}-${account.accountType}`}
                    className="bank-card"
                  >
                    <div className="bank-top">
                      <h3>{account.bank}</h3>
                      <span>{account.accountType}</span>
                    </div>

                    <div className="bank-metrics">
                      <p>
                        <span>Saldo</span>
                        <strong>{currency(account.balance)}</strong>
                      </p>
                      <p>
                        <span>Total investido</span>
                        <strong>{currency(account.investedAmount ?? 0)}</strong>
                      </p>
                      <p>
                        <span>Valor atual</span>
                        <strong>
                          {currency(account.currentInvestmentValue ?? 0)}
                        </strong>
                      </p>
                    </div>

                    <div className="inv-list">
                      {account.investments.map((inv) => (
                        <div key={inv.id} className="inv-row">
                          <div>
                            <p className="inv-name">{inv.name}</p>
                            <p className="inv-meta">
                              {inv.category} • {inv.profitability}
                            </p>
                          </div>
                          <div className="inv-values">
                            <span>{currency(inv.currentValue)}</span>
                            <small>
                              Investido: {currency(inv.investedAmount)}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>

        {!flightResult && !showFlightForm ? (
          <section className="flight-hero">
            <div className="flight-art" aria-hidden="true">
              <div className="flight-sky" />
              <div className="flight-cloud cloud-a" />
              <div className="flight-cloud cloud-b" />
              <div className="flight-cloud cloud-c" />
              <div className="flight-trail" />
              <div className="flight-plane">✈</div>
            </div>

            <div className="flight-copy">
              <p className="flight-kicker">Viagem com pontos</p>
              <h2>Cobrir passagem de avião</h2>
              <p>
                Veja se sua viagem pode sair de graça usando seus pontos como
                milhas.
              </p>
              <div className="flight-points">
                <span className="flight-points-label">Seus pontos</span>
                <strong>{pointsLabel}</strong>
                <span className="flight-points-note">
                  Equivalem a {pointsValueLabel} em cobertura.
                </span>
              </div>
              <button
                className="flight-btn"
                onClick={() => setShowFlightForm(true)}
              >
                Ver cobertura da passagem
              </button>
            </div>
          </section>
        ) : null}

        {showFlightForm ? (
          <form className="flight-form" onSubmit={handleFlightCoverage}>
            <div className="flight-form-header">
              <div>
                <p className="flight-kicker">Aeronave</p>
                <h3>Simular cobertura da viagem</h3>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={clearFlightResult}
              >
                Fechar
              </button>
            </div>

            <div className="flight-form-grid">
              <div className="form-group">
                <label>Valor da passagem</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={flightPrice}
                  onChange={(event) => setFlightPrice(event.target.value)}
                  placeholder="Ex: 1299,90"
                  required
                />
              </div>
              <div className="form-group">
                <label>Origem</label>
                <input
                  type="text"
                  value={flightOrigin}
                  onChange={(event) => setFlightOrigin(event.target.value)}
                  placeholder="Ex: São Paulo"
                />
              </div>
              <div className="form-group">
                <label>Destino</label>
                <input
                  type="text"
                  value={flightDestination}
                  onChange={(event) => setFlightDestination(event.target.value)}
                  placeholder="Ex: Rio de Janeiro"
                />
              </div>
              <div className="form-group">
                <label>Companhia aérea</label>
                <input
                  type="text"
                  value={flightAirline}
                  onChange={(event) => setFlightAirline(event.target.value)}
                  placeholder="Ex: Azul"
                />
              </div>
            </div>

            <div className="form-actions flight-actions">
              <button
                type="submit"
                disabled={flightBusy}
                className="primary-btn"
              >
                {flightBusy ? "Calculando..." : "Calcular cobertura"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setShowFlightForm(false);
                  setFlightPrice("");
                  setFlightOrigin("");
                  setFlightDestination("");
                  setFlightAirline("");
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {flightResult ? (
          <section
            className={`flight-result ${flightResult.canCover ? "success" : "pending"}`}
          >
            <div className="flight-result-top">
              <div className="flight-result-plane">✈</div>
              <div>
                <p className="flight-kicker">Resultado da viagem</p>
                <h2>
                  {flightResult.canCover
                    ? "Sua passagem pode sair de graça"
                    : "Ainda falta saldo para zerar a passagem"}
                </h2>
                <p>{flightResult.message}</p>
              </div>
            </div>

            <div className="flight-meter">
              <div className="flight-meter-row">
                <span>Pontos do usuário</span>
                <strong>{flightResult.pointsBalance}</strong>
              </div>
              <div className="flight-meter-row">
                <span>Valor em reais</span>
                <strong>{currency(flightResult.pointsValueInReais)}</strong>
              </div>
              <div className="flight-meter-row highlight">
                <span>Total da passagem</span>
                <strong>{currency(flightResult.flightPrice)}</strong>
              </div>
              <div className="flight-meter-row">
                <span>Saldo restante</span>
                <strong>{flightResult.remainingPoints} pontos</strong>
              </div>
            </div>

            <div className="flight-actions result-actions">
              <button
                className="primary-btn"
                onClick={() => goToStorePurchase(false)}
              >
                Autenticar e concluir
              </button>
              <button className="secondary-btn" onClick={clearFlightResult}>
                Nova simulação
              </button>
            </div>
          </section>
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
