// WARNING: edit only in UI customer

import type { Hex } from "viem";
import { mainnet, optimism, sepolia, anvil, Chain } from "viem/chains";

export const CURRENT_CHAIN_ID: string = import.meta.env.VITE_CURRENT_CHAIN_ID;
export let CHAIN: Chain;
export let API_PROVIDER_REGISTRY_ADDRESS: Hex;
export let RPC_URL: string;
console.log("importing environment variables");

switch (CURRENT_CHAIN_ID) {
  case "31337":
    CHAIN = anvil;
    break;
  case "11155111":
    CHAIN = sepolia;
    API_PROVIDER_REGISTRY_ADDRESS = import.meta.env.VITE_SEPOLIA_API_PROVIDER_REGISTRY_ADDRESS;
    RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL;
    break;
  case "1":
    CHAIN = mainnet;
    API_PROVIDER_REGISTRY_ADDRESS = import.meta.env.VITE_MAINNET_API_PROVIDER_REGISTRY_ADDRESS;
    RPC_URL = import.meta.env.VITE_MAINNET_RPC_URL;
    break;
  case "10":
    API_PROVIDER_REGISTRY_ADDRESS = import.meta.env.VITE_OPTIMISM_API_PROVIDER_REGISTRY_ADDRESS;
    CHAIN = optimism;
    RPC_URL = import.meta.env.VITE_OPTIMISM_RPC_URL;
    break;
  default:
    throw new Error(`Invalid CURRENT_CHAIN_ID`);
}
