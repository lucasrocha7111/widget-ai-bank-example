export function currency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
    }).format(value);
}

export function formatPrice(value: number): string {
    return `$${Number(value).toFixed(2)}`;
}

export function computeDiscount(points: number): number {
    const blocks = Math.floor(points / 100);
    return Math.min(20, blocks * 5);
}
