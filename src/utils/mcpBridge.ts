type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
};

type BridgeConfig = {
    appName: string;
    appVersion: string;
    protocolVersion?: string;
};

export function createMcpBridge(config: BridgeConfig) {
    const pendingRequests = new Map<number, PendingRequest>();
    let rpcId = 0;

    const rpcNotify = (method: string, params: unknown) => {
        window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
    };

    const rpcRequest = (method: string, params: unknown) =>
        new Promise<unknown>((resolve, reject) => {
            const id = ++rpcId;
            pendingRequests.set(id, { resolve, reject });
            window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        });

    let readyPromise: Promise<void> | null = null;

    const handleMessage = (event: MessageEvent) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== "2.0") return;

        if (typeof message.id === "number") {
            const pending = pendingRequests.get(message.id);
            if (!pending) return;
            pendingRequests.delete(message.id);

            if (message.error) {
                pending.reject(message.error);
                return;
            }

            pending.resolve(message.result);
        }
    };

    const startBridge = async () => {
        window.addEventListener("message", handleMessage, { passive: true });

        readyPromise = (async () => {
            await rpcRequest("ui/initialize", {
                appInfo: { name: config.appName, version: config.appVersion },
                appCapabilities: {},
                protocolVersion: config.protocolVersion ?? "2026-01-26",
            });
            rpcNotify("ui/notifications/initialized", {});
        })();

        return readyPromise;
    };

    const stopBridge = () => {
        window.removeEventListener("message", handleMessage);
        pendingRequests.clear();
        readyPromise = null;
    };

    return {
        startBridge,
        stopBridge,
        async callTool(name: string, args: unknown) {
            if (!readyPromise) {
                throw new Error("MCP bridge has not been started.");
            }
            await readyPromise;
            return rpcRequest("tools/call", { name, arguments: args });
        },
    };
}
