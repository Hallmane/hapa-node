import { useState, useEffect } from "react";
import {
  API_PROVIDER_REGISTRY_ADDRESS,
  CHAIN,
  RPC_URL,
} from "../shared_imports";
import ApiProviderRegistryAbi from "../abi/ApiProviderRegistry.json";
import {
  createPublicClient,
  http,
  PublicClient,
  createWalletClient,
  custom,
} from "viem";

export function SetOnlineStatus() {
  const [onlineStatus, setOnlineStatus] = useState(false);

  const updateOnlineStatus = async (status: boolean) => {
    const [account] = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const walletClient = createWalletClient({
      chain: CHAIN,
      transport: custom(window.ethereum),
      account,
    });
    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(),
    });

    const setOnline = async () => {
      try {
        const tx = await walletClient.writeContract({
          address: API_PROVIDER_REGISTRY_ADDRESS,
          abi: ApiProviderRegistryAbi.abi,
          functionName: "set_online",
          account: walletClient.account,
          args: [status],
        });
        console.log("Transaction sent:", tx);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: tx,
        });
        console.log("Transaction receipt:", receipt);
      } catch (error) {
        console.error("Error updating online status:", error);
      }
    };
    setOnline();
  };

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold mb-4">Set Online Status</h2>
      <div className="flex items-center mb-4">
        <span className="mr-2">Status:</span>
        <span
          className={`font-semibold ${
            onlineStatus ? "text-green-500" : "text-red-500"
          }`}
        >
          {onlineStatus ? "Online" : "Offline"}
        </span>
      </div>
      <div className="flex space-x-4">
        <button
          type="button"
          onClick={() => updateOnlineStatus(true)}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          Set Online
        </button>
        <button
          type="button"
          onClick={() => updateOnlineStatus(false)}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Set Offline
        </button>
      </div>
    </div>
  );
}

export default SetOnlineStatus;
