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
  Hex,
} from "viem";
import { ApiProviderData } from "../interfaces/ApiProviderData";

export function GetProviderData({ ourAddress }: { ourAddress: string }) {
  const [apiProviderData, setApiProviderData] =
    useState<ApiProviderData | null>(null);

  const getProviderData = async () => {
    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http(),
    });

    try {
      const apiProviderData = await publicClient.readContract({
        address: API_PROVIDER_REGISTRY_ADDRESS,
        abi: ApiProviderRegistryAbi.abi,
        functionName: "get_api_provider_data",
        args: [ourAddress],
      });
      console.log("Data received:", apiProviderData);
      setApiProviderData(apiProviderData as ApiProviderData);
    } catch (error) {
      console.error("Error updating online status:", error);
    }
  };

  useEffect(() => {
    console.log("ourAddress", ourAddress);
    if (ourAddress) {
      getProviderData();
    }
  }, [ourAddress]);

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold mb-4">Provider Data</h2>
      {apiProviderData ? (
        <div>
          <p>API URL: {apiProviderData.api_url}</p>
          <p>Service Description: {apiProviderData.service_description}</p>
          <p>Resources Available: {apiProviderData.resources_available.toString()}</p>
          <p>Online Status: {apiProviderData.online ? 'Online' : 'Offline'}</p>
        </div>
      ) : (
        <p>Loading provider data...</p>
      )}
    </div>
  );
}

export default GetProviderData;
