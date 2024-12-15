import KinodeApi from '@kinode/client-api';
import { PROVIDER_PROCESS_NAME } from './urls';

// utils/websocket.ts
export function createWebSocketConnection(config: {
    onMessage: (event: any) => void,
    onOpen: () => void,
    onError: (error: Event) => void
}) {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseDelay = 1000; // Start with 1 second delay

    function connect() {
        const api = new KinodeApi({
            nodeId: (window as any).our?.node,
            processId: PROVIDER_PROCESS_NAME,
            onMessage: config.onMessage,
            onOpen: () => {
                reconnectAttempts = 0;
                config.onOpen();
            },
            onClose: () => {
                if (reconnectAttempts < maxReconnectAttempts) {
                    const delay = baseDelay * Math.pow(2, reconnectAttempts);
                    setTimeout(() => {
                        reconnectAttempts++;
                        connect();
                    }, delay);
                }
            },
            onError: config.onError
        });

        return api;
    }

    return connect();
}