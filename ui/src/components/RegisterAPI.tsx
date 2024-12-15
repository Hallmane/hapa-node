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

export function RegisterAPI({
  setOurAddress,
}: {
  setOurAddress: (address: string) => void;
}) {
  const [apiUrl, setApiUrl] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [resourcesAvailable, setResourcesAvailable] = useState<number | "">("");

  const handleSubmit = async () => {
    const data = {
      apiUrl,
      serviceDescription,
      resourcesAvailable,
    };
    console.log("here 1");
    const [account] = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    console.log("here 2");

    const walletClient = createWalletClient({
      chain: CHAIN,
      transport: custom(window.ethereum),
      account,
    });
    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(),
    });
    console.log("here 3");

    console.log("Submitted Data:", data);
    const registerAPI = async () => {
      try {
        const tx = await walletClient.writeContract({
          address: API_PROVIDER_REGISTRY_ADDRESS,
          abi: ApiProviderRegistryAbi.abi,
          functionName: "register_api",
          args: [apiUrl, serviceDescription, resourcesAvailable],
          account: walletClient.account,
        });
        console.log("Transaction sent:", tx);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: tx,
        });
        console.log("Transaction receipt:", receipt);
        console.log("Transaction from:", receipt.from);
        localStorage.setItem("our_address", receipt.from);
        setOurAddress(receipt.from);
      } catch (error) {
        console.error("Error registering API:", error);
      }
    };
    registerAPI();
  };

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold mb-4">Provider Settings</h2>
      <div className="mb-4">
        <label
          htmlFor="apiUrl"
          className="block text-sm font-medium text-gray-700"
        >
          API URL
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="apiUrl"
            id="apiUrl"
            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="Enter API URL"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
        </div>
      </div>
      <div className="mb-4">
        <label
          htmlFor="serviceDescription"
          className="block text-sm font-medium text-gray-700"
        >
          Service Description
        </label>
        <div className="mt-1">
          <textarea
            id="serviceDescription"
            name="serviceDescription"
            rows={3}
            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="Enter service description"
            value={serviceDescription}
            onChange={(e) => setServiceDescription(e.target.value)}
          ></textarea>
        </div>
      </div>
      <div className="mb-4">
        <label
          htmlFor="resourcesAvailable"
          className="block text-sm font-medium text-gray-700"
        >
          Resources Available (GPU hours)
        </label>
        <div className="mt-1">
          <input
            type="number"
            name="resourcesAvailable"
            id="resourcesAvailable"
            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
            placeholder="Enter available GPU hours"
            value={resourcesAvailable}
            onChange={(e) =>
              setResourcesAvailable(
                e.target.value === "" ? "" : Number(e.target.value)
              )
            }
          />
        </div>
      </div>
      <div>
        <button
          type="button"
          onClick={handleSubmit}
          className="mt-4 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

export default RegisterAPI;
