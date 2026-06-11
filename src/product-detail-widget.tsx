import React from "react";
import { createRoot } from "react-dom/client";
import ProductDetailApp from "./components/product-detail/ProductDetailApp";

const rootElement = document.getElementById("root");
if (rootElement) {
    createRoot(rootElement).render(<ProductDetailApp />);
}
