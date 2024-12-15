use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use kinode_process_lib::{
    Address, kiprintln,
    LazyLoadBlob,
    http,
    http::server
};


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct State {
    pub state: ProviderState,
    pub coordinator: Option<Address>,
    pub supported_models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProviderState {
    Unbound,      // Online, no coordinator assigned
    Idle,         // Online, connected to coordinator, ready for work
    Offline,      // Offline
    Working {     // Online, processing a request
        request: WorkRequest,
        progress: Option<u32>,
    },
    Failed {      // Online, error state, includes reason. Still bound to coordinator
        error: WorkError,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkRequest {
    pub id: String,
    pub model: String,
    pub uri: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkResult {
    pub id: String,
    pub embeddings: Vec<f32>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkError {
    pub id: String,
    pub error: String,
    pub timestamp: u64,
}

// Messages that can trigger state transitions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ProviderEvent {
    RegisterWithCoordinator(Address),
    StartWork(WorkRequest),
    CompleteWork(WorkResult),
    FailWork { error: WorkError },
    UpdateProgress(u32),
    Kicked,
    GoOffline,
    GoOnline(Address),
    Error(String),
}

// Unprompted messages from provider to coordinator
#[derive(Debug, Serialize, Deserialize)]
pub enum CoordinatorRequest {
    RegisterProvider { supported_models: Vec<String> },
    ProviderReady,
    GoOffline,
}

// Prompted responses from coordinator to provider
#[derive(Debug, Serialize, Deserialize)]
pub enum CoordinatorResponse {
    ProviderRegistered { required_models: Vec<String> },
    RegistrationRejected { reason: String },
    NoWorkAvailable,
    Ack,
    Nack,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProviderStatus {
    Idle,
    Working,
    Offline,
}

// Unprompted Coordinator to Provider messages
#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub enum ProviderRequest {
    HealthPing,
    AssignWork(WorkRequest),
    Kick,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ProviderResponse {
    HealthPong,
    WorkAssigned,
    WorkCompleted { 
        result: WorkResult 
    },
    WorkFailed { 
        error: WorkError 
    },
    Error(String),
}
// Messages for UI communication
#[derive(Debug, Serialize, Deserialize)]
pub struct WebSocketMessage {
    pub message_type: String,
    pub data: serde_json::Value,
}

impl State {
    pub fn new() -> Self {
        Self {
            state: ProviderState::Unbound,
            coordinator: None,
            supported_models: vec!["clip-vit-base-patch16".to_string()],
        }
    }

    pub fn safe_transition(&mut self, event: ProviderEvent, channel_id: u32) -> anyhow::Result<()> {
        self.transition(event)?;
        save_state(self)?;
        notify_ui_state_change(self, &channel_id)?;
        Ok(())
    }

    pub fn transition(&mut self, event: ProviderEvent) -> anyhow::Result<()> {
        use ProviderEvent::*;
        use ProviderState::*;

        self.state = match (&self.state, event) {
            // Registration
            (Unbound, RegisterWithCoordinator(addr)) => {
                kiprintln!("Transitioning from Unbound to Idle with coordinator");
                self.coordinator = Some(addr);
                Idle
            }

            (Idle, GoOffline) => {
                kiprintln!("Transitioning from Idle to Offline");
                Offline
            },
            
            // Work lifecycle
            (Idle, StartWork(req)) => {
                kiprintln!("Transitioning from Idle to Working");
                Working {
                    request: req,
                    progress: None,
                }
            },
            (Working { request, .. }, CompleteWork(result)) if request.id == result.id => {
                kiprintln!("Transitioning from Working to Idle - work completed");
                Idle
            },
            (Working { request, .. }, FailWork { error }) if request.id == error.id=> {
                kiprintln!("Transitioning from Working to Failed");
                Failed { error }
            },
            (Working { request, .. }, UpdateProgress(p)) => {
                kiprintln!("Updating work progress to {}", p);
                Working {
                    request: request.clone(),
                    progress: Some(p),
                }
            },

            (Failed { .. }, GoOnline(addr)) => {
                kiprintln!("Transitioning from Failed to Idle via GoOnline");
                self.coordinator = Some(addr);
                Idle
            },
            (Failed { .. }, StartWork(_)) => {
                kiprintln!("Transitioning from Failed to Idle via StartWork");
                Idle
            },
            (Failed { .. }, RegisterWithCoordinator(addr)) => {
                kiprintln!("Transitioning from Failed to Idle via RegisterWithCoordinator");
                self.coordinator = Some(addr);
                Idle
            },

            (_, RegisterWithCoordinator(addr)) => {
                kiprintln!("Transitioning to Idle via RegisterWithCoordinator (catch-all)");
                self.coordinator = Some(addr);
                Idle
            },

            (_, GoOnline(addr)) => {
                kiprintln!("Transitioning to Idle via GoOnline (catch-all)");
                self.coordinator = Some(addr);
                Idle
            },
            
            (_, Kicked) => {
                kiprintln!("Transitioning to Unbound via Kick (catch-all)");
                self.coordinator = None;
                Unbound
            }

            // Error handling
            (_, Error(err)) => {
                kiprintln!("Transitioning to Failed due to error: {}", err);
                Failed { 
                    error: WorkError { 
                        id: "".to_string(), 
                        error: err, 
                        timestamp: 0 
                    } 
                }
            },

            // Invalid transitions
            (current, event) => return Err(anyhow::anyhow!(
                "Invalid state transition from {:?} with event {:?}", 
                current, event
            )),
        };

        Ok(())
    }
}

pub fn notify_ui_state_change(
    state: &State,
    channel_id: &u32,
) -> anyhow::Result<()> {
    let state_update = serde_json::json!({
        "type": "state_update",
        "state": state,
        "coordinator": state.coordinator.as_ref().map(|addr| addr.to_string())
    });


    http::server::send_ws_push(
        *channel_id,
        server::WsMessageType::Text,
        LazyLoadBlob {
            mime: Some("application/json".to_string()),
            bytes: serde_json::to_vec(&state_update)?,
        },
    );

    Ok(())
}

pub fn save_state(state: &State) -> anyhow::Result<()> {
    kinode_process_lib::set_state(&bincode::serialize(state)?);
    Ok(())
}

pub fn update_state(state: &mut State, channel_id: u32) -> anyhow::Result<()> {
    save_state(state)?;
    notify_ui_state_change(state, &channel_id)?;
    Ok(())
}
