export interface ResourceTaken {
  api_coordinator: string; // Address of the API coordinator
  amount: bigint; // Amount of resources taken (uint256 as bigint)
}

// Main Interface for ApiProviderData
export interface ApiProviderData {
  api_url: string; // API URL
  service_description: string; // Description of the service
  online: boolean; // Online status (true/false)
  resources_available: bigint; // Resources available (uint256 as bigint)
  resources_taken: ResourceTaken[]; // Array of resources taken
}
