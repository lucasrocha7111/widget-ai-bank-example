import React from "react";
import { createRoot } from "react-dom/client";
import TodoApp from "./components/todo/TodoApp";

const rootElement = document.getElementById("root");
if (rootElement) {
    createRoot(rootElement).render(<TodoApp />);
}
