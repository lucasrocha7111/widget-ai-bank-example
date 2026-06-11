import type { Product } from "../../types";
import { currency } from "../../utils/currency";

type ProductCardProps = {
    product: Product;
    busy: boolean;
    detailUrl: string;
    onPurchase: (usePoints: boolean) => void;
};

export default function ProductCard({
    product,
    busy,
    detailUrl,
    onPurchase,
}: ProductCardProps) {
    return (
        <section className="product">
            <img alt={product.name} src={product.imageUrl} />
            <div>
                <h2>{product.name}</h2>
                <p>{product.description}</p>
                <p className="price">{currency(product.price)}</p>
                <p className="stock">Estoque: {product.stock}</p>

                <div className="actions">
                    <button
                        type="button"
                        disabled={busy || product.stock <= 0}
                        onClick={() => onPurchase(false)}
                    >
                        Comprar
                    </button>
                    <button
                        type="button"
                        className="secondary"
                        disabled={busy || product.stock <= 0}
                        onClick={() => onPurchase(true)}
                    >
                        Comprar com pontos
                    </button>
                    <a href={detailUrl} target="_blank" rel="noreferrer">
                        Ver detalhes
                    </a>
                </div>
            </div>
        </section>
    );
}
