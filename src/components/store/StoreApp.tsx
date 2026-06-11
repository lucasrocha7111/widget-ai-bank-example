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

    return (
        <div className="shell">
            <header className="hero">
                <p className="kicker">Itau Benefits</p>
                <h1>Loja com pontos no app</h1>
                <p>Pesquise por linguagem natural e finalize com desconto por pontos.</p>
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
