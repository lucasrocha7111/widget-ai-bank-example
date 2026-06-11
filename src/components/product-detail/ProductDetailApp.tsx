import React, { useEffect, useState } from "react";
import type { Product, User } from "../../types";
import { computeDiscount, formatPrice } from "../../utils/currency";
import {
    apiOrigin,
    buildPurchaseLink,
    resolveProductId,
    serverOrigin,
} from "../../utils/urls";
import ProductSpecRow from "./ProductSpecRow";

declare global {
    interface Window {
        __SERVER_ORIGIN?: string;
        __PRESELECTED_PRODUCT_ID?: string;
        __INITIAL_PRODUCT?: Product | null;
        __INITIAL_USER?: User | null;
    }
}

const initialProduct = window.__INITIAL_PRODUCT ?? null;
const initialUser = window.__INITIAL_USER ?? null;


export default function ProductDetailApp() {
    const productId = resolveProductId();
    const [product, setProduct] = useState<Product | null>(
        initialProduct && initialProduct.id === productId ? initialProduct : null,
    );
    const [user, setUser] = useState<User | null>(
        initialProduct && initialProduct.id === productId ? initialUser : null,
    );
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!productId) {
            setError("Nenhum produto foi informado para abrir os detalhes.");
            setLoading(false);
            return;
        }

        let active = true;
        const controller = new AbortController();

        const loadProduct = async () => {
            try {
                const [productResponse, userResponse] = await Promise.all([
                    fetch(`${apiOrigin}/products/${encodeURIComponent(productId)}`, {
                        signal: controller.signal,
                    }),
                    fetch(`${apiOrigin}/users/user-1`, { signal: controller.signal }),
                ]);

                const productData = await productResponse.json();
                const userData = await userResponse.json();

                if (!active) return;

                if (productResponse.ok && !productData?.error) {
                    setProduct(productData);
                }

                if (userResponse.ok) {
                    setUser(userData);
                }

                if (!productResponse.ok || productData?.error) {
                    throw new Error(productData?.error || "Falha ao carregar produto");
                }
            } catch (loadError) {
                if (!active) return;
                if (!product) {
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : "Não foi possível carregar o produto.",
                    );
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        if (!product || product.id !== productId) {
            loadProduct();
        } else {
            setLoading(false);
        }

        return () => {
            active = false;
            controller.abort();
        };
    }, [productId]);

    const discountPercent = computeDiscount(user?.points ?? 0);
    const discountedPrice = product ? product.price * (1 - discountPercent / 100) : 0;
    const stockText = product?.stock === 0 ? "Sem estoque" : "Em estoque";
    const stockClass = product?.stock === 0 ? "badge out-stock" : "badge in-stock";

    const purchaseLink = product
        ? buildPurchaseLink(product.id, false)
        : `${serverOrigin}/store`;

    function goBack() {
        window.location.href = `${serverOrigin}/store`;
    }

    function goToStorePurchase() {
        window.open(purchaseLink, "_blank", "noopener,noreferrer");
    }

    return (
        <div className="shell">
            <div className="topbar">
                <button className="btn btn-back" type="button" onClick={goBack}>
                    Voltar para loja
                </button>
            </div>

            <div className="panel">
                <div className="hero">
                    <h1>{loading ? "Carregando produto..." : product?.name ?? "Produto não encontrado"}</h1>
                    <p>{loading ? "Buscando detalhes completos" : "Tela específica do item selecionado"}</p>
                </div>

                <div className="content">
                    <div className="photo-wrap">
                        <img
                            src={product?.imageUrl ?? ""}
                            alt={product?.name ?? "Produto"}
                        />
                    </div>

                    <div className="specs">
                        <div className="price-block">
                            <div className="price-original">
                                {discountPercent > 0 ? formatPrice(product?.price ?? 0) : ""}
                            </div>
                            <div className="price-final">{formatPrice(discountedPrice)}</div>
                            <div className="discount-note">
                                {product
                                    ? discountPercent > 0
                                        ? `${discountPercent}% OFF para você com ${user?.points ?? 0} pontos. Economia de ${formatPrice(
                                            product.price - discountedPrice,
                                        )}.`
                                        : `Sem desconto no momento. Você tem ${user?.points ?? 0} pontos.`
                                    : "Calculando desconto..."}
                            </div>
                        </div>

                        <div id="stock-badge" className={stockClass}>
                            {stockText}
                        </div>

                        <div className="list">
                            <ProductSpecRow label="ID" value={product?.id ?? "-"} />
                            <ProductSpecRow label="Descrição" value={product?.description ?? "-"} />
                            <ProductSpecRow label="Estoque" value={product ? `${product.stock} unidade(s)` : "-"} />
                        </div>

                        <div className="footer">
                            <button className="btn btn-buy" type="button" onClick={goToStorePurchase}>
                                Comprar na loja
                            </button>
                            <a
                                className="btn btn-buy"
                                href={purchaseLink}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Comprar na loja
                            </a>
                        </div>

                        <div className="error" style={{ display: error ? "block" : "none" }}>
                            {error}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
