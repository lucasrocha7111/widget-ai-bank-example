import React, { useEffect, useMemo, useState } from "react";
import type { TodoTask } from "../../types";
import { createMcpBridge } from "../../utils/mcpBridge";
import TodoList from "./TodoList";

export default function TodoApp() {
    const [tasks, setTasks] = useState<TodoTask[]>([]);
    const [title, setTitle] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [busyTodoIds, setBusyTodoIds] = useState<Set<string>>(new Set());
    const bridge = useMemo(
        () => createMcpBridge({ appName: "todo-widget", appVersion: "0.1.0" }),
        [],
    );

    useEffect(() => {
        const handleToolResult = (event: MessageEvent) => {
            if (event.source !== window.parent) return;
            const message = event.data;
            if (!message || message.jsonrpc !== "2.0") return;
            if (message.method === "ui/notifications/tool-result") {
                const response = message.params;
                if (response?.structuredContent?.tasks) {
                    setTasks(response.structuredContent.tasks);
                }
            }
        };

        window.addEventListener("message", handleToolResult, { passive: true });

        bridge.startBridge().catch((error) => {
            console.error("Unable to initialize MCP bridge:", error);
        });

        return () => {
            window.removeEventListener("message", handleToolResult);
            bridge.stopBridge();
        };
    }, [bridge]);

    const callTodoTool = async (name: string, payload: unknown) => {
        return bridge.callTool(name, payload);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed || isAdding) return;

        setIsAdding(true);
        try {
            await callTodoTool("add_todo", { title: trimmed });
            setTitle("");
        } catch (error) {
            console.error("Failed to add todo:", error);
        } finally {
            setIsAdding(false);
        }
    };

    const handleToggle = async (id: string) => {
        if (busyTodoIds.has(id)) return;

        setBusyTodoIds((current) => new Set(current).add(id));
        try {
            await callTodoTool("complete_todo", { id });
        } catch (error) {
            console.error("Failed to complete todo:", error);
        } finally {
            setBusyTodoIds((current) => {
                const next = new Set(current);
                next.delete(id);
                return next;
            });
        }
    };

    return (
        <main>
            <h2>Todo list</h2>
            <form id="add-form" autoComplete="off" onSubmit={handleSubmit}>
                <input
                    id="todo-input"
                    name="title"
                    placeholder="Add a task"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                />
                <button type="submit" disabled={isAdding}>
                    {isAdding ? "Adding…" : "Add"}
                </button>
            </form>
            <TodoList tasks={tasks} busyIds={busyTodoIds} onToggle={handleToggle} />
        </main>
    );
}
