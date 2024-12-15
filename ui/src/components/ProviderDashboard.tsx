import { useState, useEffect, useRef } from 'react';
import KinodeApi from '@kinode/client-api';
import { PROVIDER_PROCESS_NAME } from '../utils/urls';
import { getImageEmbeddings } from '../embeddings';

interface WorkRequest {
  id: string;
  model: string;
  uri: string;
  timestamp: number;
}

//@ts-ignore
interface WorkResult {
  id: string;
  embeddings: number[];
  timestamp: number;
}

interface WorkError {
  id: string;
  error: string;
  timestamp: number;
}

type ProviderState = 
  | { type: 'Unbound' }
  | { type: 'Idle' }
  | { type: 'Offline' }
  | { 
      type: 'Working';
      request: WorkRequest;
      progress?: number;
    }
  | { 
      type: 'Failed';
      error: WorkError;
    };

interface State {
  state: ProviderState;
  coordinator: string | null;
  supported_models: string[];
}

export function ProviderDashboard() {

  const [hardwareStatus, setHardwareStatus] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [state, setState] = useState<State>({
    state: { type: 'Unbound' },
    coordinator: null,
    supported_models: ["clip-vit-base-patch16"]
  });
  //@ts-ignore
  const [api, setApi] = useState<KinodeApi | null>(null);
  const apiRef = useRef<KinodeApi | null>(null);
  const [jobStats, setJobStats] = useState({ totalJobs: 0, lastJobTime: null as string | null });



  // Initialize WebGPU and connect to Kinode
  useEffect(() => {
    
    async function initialize() {
      try {
        // Initialize WebGPU
        const adapter = await navigator.gpu?.requestAdapter();
        
        if (!adapter) throw new Error('No WebGPU adapter found');
        
        const device = await adapter.requestDevice();

        setHardwareStatus('ready');

        // Connect to Kinode WebSocket with detailed debugging
        //const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/${PROVIDER_PROCESS_NAME}`;
        //const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/`;
        //const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//localhost:8080/`;
        //console.log('[ProviderDashboard] Attempting WebSocket connection to:', wsUrl);
        
        //console.log('nodeId:', (window as any).our?.node);
        
        const apiInstance = new KinodeApi({
          //uri: wsUrl,
          nodeId: (window as any).our?.node,
          processId: PROVIDER_PROCESS_NAME,
          onMessage: (event: any) => {
            handleMessage(event);
          },
          onOpen: () => {
            setHardwareStatus('ready');
            apiInstance.send({
              data: {
                message_type: 'still_bound',
                data: "lol"
              }
            });
          },
          onClose: () => {
          },
          onError: (error: Event) => {
            console.error('[ProviderDashboard] WebSocket error:', error);
            setHardwareStatus('error');
            setHardwareError(error.toString());
          }
        });


        setApi(apiInstance);
        apiRef.current = apiInstance;

      } catch (error: any) {
        console.error('[ProviderDashboard] Initialization error:', error);
        setHardwareStatus('error');
        setHardwareError(error.message);
      }
    }

    initialize();
    return () => {
      apiRef.current = null;
      setApi(null);
    };
  }, []);

  // Handle incoming messages from provider process
  const handleMessage = async (event: any) => {
    //console.log('[ProviderDashboard] Processing message:', {
    //  raw: event,
    //  parsed: typeof event === 'string' ? JSON.parse(event) : event
    //});
    
    const message = typeof event === 'string' ? JSON.parse(event) : event;

    switch (message.type) {
      case 'state_update':
        //console.log('[ProviderDashboard] State update received:', {
        //  message,
        //  data: message.data, // Check if data exists
        //  type: message.type,
        //  state: message.state,
        //  coordinator: message.coordinator,
        //  fullMessage: JSON.stringify(message, null, 2) // Full message structure
        //});
        const stateString = message.state.state;
        const transformedState = {
          type: stateString,  // This converts "Idle" to { type: "Idle" }
          ...(stateString === 'Working' ? { request: message.state.request } : {}),
          ...(stateString === 'Failed' ? { error: message.state.error } : {})
        };
  
        setState(prevState => ({
          ...prevState,
          state: transformedState,
          coordinator: message.coordinator ?? prevState.coordinator
        }));

        // Validate the incoming state matches our type expectations
        if (!message.state?.type) {
          break;
        }

        break;

      case 'work_request':
        if (!message.data?.uri) {
          console.warn('Invalid work request - missing URI');
          break;
        }
        
        if (!apiRef.current) {
          console.error('No API connection available');
          break;
        }

        try {
          const embeddings = await getImageEmbeddings(message.data.uri);
          
          apiRef.current?.send({
            data: {
              message_type: 'work_result',
              data: embeddings
            }
          });

          setJobStats(prev => ({
            totalJobs: prev.totalJobs + 1,
            lastJobTime: new Date().toLocaleTimeString()
          }));

        } catch (error: any) {
          console.error('Work processing error:', error);
          if (apiRef.current) {
            apiRef.current.send({
              data: {
                message_type: 'work_failed',
                data: { error: error.message }
              }
            });
          }
        }
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  };

  // Register with a coordinator
  const handleCoordinatorSelect = async (coordinatorAddress: string) => {
    try {
      const response = await fetch(`/${PROVIDER_PROCESS_NAME}/register_provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinator_address: coordinatorAddress }),
      });
  
      if (!response.ok) {
        throw new Error(await response.text());
      }
  
      
      // Send still_bound message and wait for state update from backend
      apiRef.current?.send({
        data: {
          message_type: 'still_bound',
          data: coordinatorAddress // Pass coordinator address
        }
      });
      
    } catch (error: any) {
      console.error('Registration error:', error);
      setState(prevState => ({
        ...prevState,
        state: { 
          type: 'Failed', 
          error: { 
            id: '', 
            error: error.message, 
            timestamp: Date.now() 
          }
        }
      }));
    }
  };

  useEffect(() => {
    //console.log('State updated:', state);
  }, [state]);

  // Add the helper function for action buttons
  const getActionButtons = () => {
    if (state.state.type === 'Unbound') {
      return null;
    }

    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {state.state.type !== 'Offline' && (
          <button 
            onClick={() => {
              apiRef.current?.send({
                data: {
                  message_type: 'go_offline',
                  data: "lol"
                }
              });
              //setState({ ProviderState: 'Offline', coordinator: state.coordinator ?? '' });
            }}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#F43F5E',
              color: 'white',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              transition: 'all 150ms'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#E11D48'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#F43F5E'}
          >
            Go Offline
          </button>
        )}
        
        {state.state.type === 'Offline' && (
          <button 
            onClick={() => {
              apiRef.current?.send({
                data: {
                  message_type: 'still_bound',
                  data: "lol"
                }
              });
            }}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#22C55E',
              color: 'white',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              transition: 'all 150ms'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#16A34A'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#22C55E'}
          >
            Go Online
          </button>
        )}

        <button 
          onClick={() => {
            apiRef.current?.send({
              data: {
                message_type: 'still_bound',
                data: "lol"
              }
            });
          }}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3B82F6',
            color: 'white',
            borderRadius: '0.25rem',
            fontSize: '0.875rem',
            transition: 'all 150ms'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563EB'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3B82F6'}
        >
          Ping Coordinator
        </button>
      </div>
    );
  };

  return (
    <div style={{ 
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: '#F9FAFB',
      padding: 0,
      margin: 0,
      position: 'absolute',
      left: 0,
      top: 0
    }}>
      <div style={{ 
        width: '100%',
        maxWidth: '675px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '2rem'
      }}>
        <h3 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 'bold',
          color: '#1F2937',
          textAlign: 'center',
          margin: 0
        }}>Embedding Provider Node</h3>
        <div style={{
          fontSize: '0.875rem',
          color: '#4B5563',
          textAlign: 'center',
          margin: 0
        }}>
          {(window as any).our?.node}
        </div>

        {/* Hardware Status */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '0.75rem',
              height: '0.75rem',
              borderRadius: '9999px',
              backgroundColor: hardwareStatus === 'ready' ? '#22C55E' :
                             hardwareStatus === 'error' ? '#EF4444' : 
                             '#EAB308'
            }} />
            <span>
              {hardwareStatus === 'ready' ? 'WebGPU - clip-vit-base-patch16' :
               hardwareStatus === 'error' ? `WebGPU Error: ${hardwareError}` :
               'Initializing WebGPU...'}
            </span>
          </div>
        </div>

        {/* Status Banner */}
        <div style={{
          padding: '1rem',
          backgroundColor: state.state.type === 'Unbound' ? '#FEF3C7' :
                          state.state.type === 'Idle' ? '#DCFCE7' :
                          state.state.type === 'Offline' ? '#FEE2E2' :
                          state.state.type === 'Working' ? '#DBEAFE' :
                          '#FEF2F2',
          borderRadius: '0.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/*}
            <div style={{
              width: '1rem',
              height: '1rem',
              borderRadius: '9999px',
              backgroundColor: state.state.type === 'Idle' ? '#22C55E' :
                             state.state.type === 'Offline' ? '#EF4444' :
                             state.state.type === 'Working' ? '#3B82F6' :
                             '#FCD34D',
              animation: state.state.type === 'Working' ? 'pulse 2s infinite' : 'none'
            }} />
            */}
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                {state.state.type === 'Unbound' ? 'Unbound' :
                 state.state.type === 'Idle' ? 'Idle' :
                 state.state.type === 'Offline' ? 'Offline' :
                 state.state.type === 'Working' ? 'Working' :
                 'Error'}
              </h2>
              {state.state.type !== 'Unbound' && (
                <p style={{ color: '#4B5563', marginTop: '0.25rem' }}>
                  Coordinator: {state.state.type === 'Idle' ? state.coordinator?.split('@')[0] : ''}
                </p>
              )}
            </div>
          </div>
          {getActionButtons()}
        </div>


        {/* Provider Status */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          padding: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            {/*
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                {providerState.type === 'Unbound' && 'Select Coordinator'}
                {providerState.type === 'Idle' && 'Ready for Work'}
                {providerState.type === 'Working' && 'Processing Request'}
                {providerState.type === 'Failed' && 'Error'}
              </h3>
              {providerState.type !== 'Unbound' && providerState.type !== 'Failed' && (
                <p style={{ color: '#4B5563' }}>
                  {providerState.type === 'Idle' ? 
                    `Connected to ${providerState.coordinator}` :
                    providerState.type === 'Working' ? 
                      `Processing ${providerState.request.model}` : ''
                  }
                </p>
              )}
            </div>

            <div style={{
              width: '0.75rem',
              height: '0.75rem',
              borderRadius: '9999px',
              backgroundColor: providerState.type === 'Idle' ? '#22C55E' :
                             providerState.type === 'Working' ? '#EAB308' :
                             providerState.type === 'Failed' ? '#EF4444' :
                             '#6B7280',
              animation: providerState.type === 'Working' ? 'pulse 2s infinite' : 'none'
            }} />
            */}
          </div>

          {/* Coordinator Selection */}
          {state.state.type === 'Unbound' && (
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>Coordinators</h3>
          )}
          {state.state.type === 'Unbound' && (
            <CoordinatorList onSelect={handleCoordinatorSelect} />
          )}

          {/* Work Progress */}
          {state.state.type === 'Working' && (
            <div style={{
              width: '100%',
              backgroundColor: '#E5E7EB',
              borderRadius: '9999px',
              height: '0.625rem'
            }}>
              <div style={{
                backgroundColor: '#2563EB',
                height: '0.625rem',
                borderRadius: '9999px',
                width: `${state.state.progress}%`,
                transition: 'all 500ms'
              }} />
            </div>
          )}

          {/* Error Display */}
          {state.state.type === 'Failed' && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FEE2E2',
              borderRadius: '0.25rem',
              color: '#B91C1C'
            }}>
              {state.state.type === 'Failed' && state.state.error.error}
            </div>
          )}

          {/* Stats */}
          {state.state.type !== 'Unbound' && (
            <div style={{
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid #E5E7EB'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#4B5563' }}>
                <p>Total jobs completed: {jobStats.totalJobs}</p>
                {jobStats.lastJobTime && (
                  <p>Last job completed: {jobStats.lastJobTime}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CoordinatorList({ onSelect }: { onSelect: (address: string) => void }) {
  const [coordinators, setCoordinators] = useState<{ address: string, requiredModels: string[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/${PROVIDER_PROCESS_NAME}/coordinators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(setCoordinators)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{
      animation: 'pulse 2s infinite',
      backgroundColor: '#F3F4F6',
      height: '8rem',
      borderRadius: '0.25rem'
    }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {coordinators.map(coordinator => (
        <button
          key={coordinator.address}
          style={{
            width: '100%',
            padding: '1rem',
            backgroundColor: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '0.5rem',
            textAlign: 'left',
            transition: 'background-color 150ms'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
          onClick={() => onSelect(coordinator.address)}
        >
          <h3 style={{ fontWeight: '500' }}>{coordinator.address}</h3>
          <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#4B5563' }}>
            <h4 style={{ fontWeight: '500' }}>Required Models:</h4>
            <ul style={{ listStyleType: 'disc', paddingLeft: '1rem', marginTop: '0.25rem' }}>
              {coordinator.requiredModels.map((model: string) => (
                <li key={model}>{model}</li>
              ))}
            </ul>
          </div>
        </button>
      ))}
    </div>
  );
}

