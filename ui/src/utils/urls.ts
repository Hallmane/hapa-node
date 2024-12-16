export const BASE_URL = import.meta.env.BASE_URL;
export const PROXY_TARGET = `${import.meta.env.VITE_NODE_URL || 'http://localhost:8080'}${BASE_URL}`;
export const WEBSOCKET_URL = import.meta.env.DEV
    ? `${PROXY_TARGET.replace('http', 'ws')}`
    : undefined;
export const PROVIDER_PROCESS_NAME = 'provider:provider:haecceity.os';
