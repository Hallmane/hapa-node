import { useState, useEffect } from 'react';
import { PROVIDER_PROCESS_NAME } from '../utils/urls';

interface Coordinator {
    address: string;
    requiredModels: string[];
}

export function CoordinatorSelection({ onCoordinatorSelected }: { 
    onCoordinatorSelected: () => void 
}) {
    const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
    const [selectedCoordinator, setSelectedCoordinator] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const getCoordinators = async () => {
        try {
            setLoading(true);
            setError(null);
            
             // hardcoded in the provider BE for now
             const response = await fetch(`/${PROVIDER_PROCESS_NAME}/coordinators`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
             });
             if (!response.ok) throw new Error('Failed to fetch coordinators');
             console.log("response:", response);
             const data = await response.json();
             setCoordinators(data);
            
        } catch (error) {
            console.error('Error fetching coordinators:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch coordinators');
        } finally {
            setLoading(false);
        }
    };

    const handleCoordinatorSelect = async (coordinator: Coordinator) => {
        try {
            setError(null);
            // Registration request matches backend state machine
            const response = await fetch(`/${PROVIDER_PROCESS_NAME}/register_provider`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    coordinator_address: coordinator.address,
                    supported_models: coordinator.requiredModels // We support what they require
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to register with coordinator');
            }

            const registrationResult = await response.json();
            
            // Check registration response
            if (registrationResult.status === 'success') {
                setSelectedCoordinator(coordinator.address);
                onCoordinatorSelected();
            } else {
                throw new Error(registrationResult.message);
            }
        } catch (error) {
            console.error('Error registering with coordinator:', error);
            setError(error instanceof Error ? error.message : 'Failed to register with coordinator');
        }
    };
    //const handleCoordinatorSelect = async (coordinator: Coordinator) => {
    //    try {
    //        setError(null);
    //        const response = await fetch(`/${PROVIDER_PROCESS_NAME}/register_provider`, {
    //            method: 'POST',
    //            headers: {
    //                'Content-Type': 'application/json',
    //            },
    //            body: JSON.stringify(coordinator.address),
    //        });

    //        if (!response.ok) {
    //            throw new Error('Failed to register with coordinator');
    //        }

    //        setSelectedCoordinator(coordinator.address);
    //        onCoordinatorSelected();
    //    } catch (error) {
    //        console.error('Error registering with coordinator:', error);
    //        setError(error instanceof Error ? error.message : 'Failed to register with coordinator');
    //    }
    //};

    useEffect(() => {
        getCoordinators();
    }, []);

    if (loading) {
        return (
            <div className="p-4">
                <div className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-4 py-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded"></div>
                            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Select a Coordinator</h2>
                <button
                    onClick={getCoordinators}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                    Refresh
                </button>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                </div>
            )}

            {coordinators.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    No coordinators available
                </div>
            ) : (
                <div className="space-y-4">
                    {coordinators.map(coordinator => (
                        <div 
                            key={coordinator.address} 
                            className={`border p-4 rounded-lg transition-colors ${
                                selectedCoordinator === coordinator.address 
                                    ? 'bg-blue-50 border-blue-200' 
                                    : 'hover:bg-gray-50 cursor-pointer'
                            }`}
                            onClick={() => handleCoordinatorSelect(coordinator)}
                        >
                            <h3 className="font-medium">{coordinator.address}</h3>
                            <div className="mt-2">
                                <h4 className="text-sm font-medium text-gray-600">Required Models:</h4>
                                <ul className="list-disc pl-4 mt-1 text-sm text-gray-600">
                                    {coordinator.requiredModels.map(model => (
                                        <li key={model}>{model}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}