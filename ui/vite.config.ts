import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
const BASE_URL = `/provider:provider:haecceity.os`;
const PROXY_URL = (
    process.env.VITE_NODE_URL || 'http://127.0.0.1:8080'
).replace('localhost', '127.0.0.1');

export default defineConfig({
    plugins: [react()],
    base: BASE_URL,
    build: {
        rollupOptions: {
            external: ['/our.js'],
        },
    },
    server: {
        open: false,
        proxy: {
            '/our': {
                target: PROXY_URL,
                changeOrigin: true,
            },
            [`${BASE_URL}/our.js`]: {
                target: PROXY_URL,
                changeOrigin: true,
                rewrite: (path) => path.replace(BASE_URL, ''),
            },
            [`^${BASE_URL}/(?!(@vite/client|src/.*|node_modules/.*|@react-refresh|$))`]: {
                target: PROXY_URL,
                ws: true,
                changeOrigin: true,
            }
        },
    },
});