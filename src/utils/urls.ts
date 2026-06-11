export const serverOrigin = (window.__SERVER_ORIGIN || "").replace(/\/$/, "");
export const apiOrigin = serverOrigin || window.location.origin;
export const purchaseDeepLinkTemplate =
    window.__STORE_PURCHASE_DEEPLINK ||
    `${apiOrigin}/store?productId={{productId}}&usePoints={{usePoints}}`;

export function buildPurchaseLink(productId: string, usePoints: boolean): string {
    let link = purchaseDeepLinkTemplate;

    if (link.includes("{{productId}}")) {
        link = link.replaceAll("{{productId}}", encodeURIComponent(productId));
    } else {
        const separator = link.includes("?") ? "&" : "?";
        link = `${link}${separator}productId=${encodeURIComponent(productId)}`;
    }

    if (link.includes("{{usePoints}}")) {
        link = link.replaceAll("{{usePoints}}", usePoints ? "1" : "0");
    }

    return link;
}

export function resolveProductId(): string {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[0] === "store" && parts[1] === "product") {
        return parts[2];
    }

    const query = new URLSearchParams(window.location.search);
    const queryId = query.get("id") || query.get("productId");
    if (queryId) return queryId;

    return window.__PRESELECTED_PRODUCT_ID ?? "";
}

