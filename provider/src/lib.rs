use std::str::FromStr;

use kinode_process_lib::{
    kiprintln, await_message, 
    println, call_init, get_blob,
    Address, LazyLoadBlob, Message, Request, Response,
    http::{
        self, 
        server::{
            HttpServer, 
            HttpBindingConfig, 
            WsMessageType, 
            HttpServerRequest
        }
    },
};

use std::collections::HashSet;

mod structs;
use structs::*;

wit_bindgen::generate!({
    path: "target/wit",
    world: "provider-template-dot-os-v0",
    generate_unused_types: true,
    additional_derives: [serde::Deserialize, serde::Serialize, process_macros::SerdeJsonInto],
});


fn handle_work_request(
    state: &mut State,
    channel_ids: &HashSet<u32>,
    work_request: WorkRequest,
) -> anyhow::Result<()> {

    // create and send back a ProviderResponse::WorkAssigned and require no response
    let response = ProviderResponse::WorkAssigned;

    kiprintln!("sending work assigned response to coordinator");
    Response::new()
        .body(serde_json::to_vec(&response)?)
        .send()?;

    let work_message = serde_json::json!({
        "type": "work_request",
        "data": {
            "id": work_request.id,
            "uri": work_request.uri,
            "model": work_request.model,
            "timestamp": work_request.timestamp,
        }
    });

    for &channel_id in channel_ids {
        kiprintln!("Sending work message to channel {}", channel_id);
        http::server::send_ws_push(
            channel_id,
            WsMessageType::Text,
            LazyLoadBlob {
                mime: Some("application/json".to_string()),
                bytes: serde_json::to_vec(&work_message)?,
            },
        );
        //state.safe_transition(ProviderEvent::StartWork(work_message), channel_id)?;
        state.safe_transition(ProviderEvent::StartWork(work_request.clone()), channel_id)?;
        state.safe_transition(ProviderEvent::UpdateProgress(0), channel_id)?;
    }

    Ok(())
}

fn handle_coordinator_message(
    state: &mut State,
    channel_ids: &HashSet<u32>,
    message: &Message,
) -> anyhow::Result<()> {
    let request: ProviderRequest = serde_json::from_slice(message.body())?;
    
    match request {
        ProviderRequest::AssignWork(work_request) => {
            kiprintln!("assigned work");
            handle_work_request(state, channel_ids, work_request)?;
        }
        ProviderRequest::HealthPing => {
            // TODO: send back health statistics
            Response::new()
                .body(serde_json::to_vec(&ProviderResponse::HealthPong)?)
                .send()?;
        }
        ProviderRequest::Kick => {
            kiprintln!("memento mori");
            state.transition(ProviderEvent::Kicked)?;
            for &channel_id in channel_ids {
                state.safe_transition(ProviderEvent::Kicked, channel_id)?;
            }
        }
    }
    Ok(())
}

fn handle_websocket_message(
    state: &mut State,
    channel_id: u32,
    message: WebSocketMessage,
) -> anyhow::Result<()> {
    match message.message_type.as_str() {
        "work_result" => {
            if let Some(embeddings) = message.data.as_array() {
                let embeddings = embeddings.iter()
                    .map(|v| v.as_f64().unwrap_or(0.0) as f32)
                    .collect();

                if let ProviderState::Working { request, .. } = &state.state {
                    let work_result = WorkResult {
                        id: request.id.clone(),
                        embeddings,
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)?
                            .as_secs(),
                    };

                    // Send result to coordinator
                    if let Some(coordinator) = &state.coordinator {
                        let res = Request::new()
                            .target(coordinator)
                            .body(serde_json::to_vec(&ProviderResponse::WorkCompleted {
                                result: work_result.clone(),
                            })?)
                            .send()?;
                        match res {
                            _ => kiprintln!("work_result received by coordinator"),
                        }
                    }

                    state.safe_transition(ProviderEvent::CompleteWork(work_result), channel_id)?;
                }
            }
        }
        "work_failed" => {
            if let ProviderState::Working { request, .. } = &state.state {
                kiprintln!("Work failed...");
                let error = message.data["error"].as_str()
                    .unwrap_or("Unknown error")
                    .to_string();

                let work_error = WorkError {
                    id: request.id.clone(),
                    error,
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)?
                        .as_secs(),
                };

                if let Some(coordinator) = &state.coordinator {
                    let res = Request::new()
                        .target(coordinator)
                        .body(serde_json::to_vec(&ProviderResponse::WorkFailed {
                            error: work_error.clone(),
                        })?)
                        .send()?;
                    match res {
                        _ => kiprintln!("work_failed received by coordinator"),
                    }
                }

                state.safe_transition(ProviderEvent::FailWork {
                    error: work_error.clone(),
                }, channel_id)?;
            }
        }
        "still_bound" => {
            let request = CoordinatorRequest::ProviderReady;
            if let Some(coordinator) = &state.coordinator {
                let response: CoordinatorResponse = serde_json::from_slice(
                    Request::to(coordinator)
                        .body(serde_json::to_vec(&request)?)
                        .send_and_await_response(5)??
                        .body()
                )?;  

                match response {
                    CoordinatorResponse::Nack => {
                        kiprintln!("You are not bound");
                        state.safe_transition(ProviderEvent::Kicked, channel_id)?;
                    }
                    CoordinatorResponse::Ack => {
                        kiprintln!("coordinator acknowledged that we are still bound");
                        state.safe_transition(ProviderEvent::GoOnline(coordinator.clone()), channel_id)?;
                    }
                    _ => {
                        kiprintln!("coordinator did not acknowledge that we are bound");
                        state.safe_transition(ProviderEvent::Kicked, channel_id)?;
                    }
                }
            } else {
                kiprintln!("no coordinator, going offline.");
                state.safe_transition(ProviderEvent::Kicked, channel_id)?;
            }

        }
        "go_offline" => {
            if let Some(coordinator) = &state.coordinator {
                let response: CoordinatorResponse = serde_json::from_slice(
                    Request::to(coordinator)
                        .body(serde_json::to_vec(&CoordinatorRequest::GoOffline)?)
                        .send_and_await_response(4)??
                        .body()
                )?;

                match response {
                    CoordinatorResponse::Ack => {
                        kiprintln!("coordinator acknowledged that we are offline");
                        state.safe_transition(ProviderEvent::GoOffline, channel_id)?;
                    }
                    _ => {
                        kiprintln!("coordinator did not acknowledge that we are offline");
                        state.safe_transition(ProviderEvent::GoOffline, channel_id)?;
                    }
                }
            } else {
                kiprintln!("no coordinator, going offline");
                state.safe_transition(ProviderEvent::GoOffline, channel_id)?;
            }
        }
        "progress_update" => { //шит?
            if let Some(progress) = message.data["progress"].as_u64() {
                kiprintln!("progress_update");
                state.safe_transition(ProviderEvent::UpdateProgress(progress as u32), channel_id)?;
            }
        }
        _ => println!("Unknown WebSocket message type: {}", message.message_type),
    }

    save_state(state)?;
    Ok(())
}

fn handle_http_request(
    state: &mut State,
    channel_ids: &HashSet<u32>,
    req: http::server::IncomingHttpRequest,
) -> anyhow::Result<()> {
    match req.path()?.as_str() {
        "/register_provider" => {
            let Some(_blob) = get_blob() else { 
                return Err(anyhow::anyhow!("missing request body")) 
            };

            //let register_request: RegisterRequest = serde_json::from_slice(&blob.bytes)?;
            //let coordinator = kinode_process_lib::Address::from_str(&register_request.coordinator_address)?;

            // Send Request to coordinator and await Response
            let coordinator = Address::from_str("pertinent.os@coordinator:coordinator:haeceity.os")?;
            kiprintln!("trying to register under coordinator: {:?}", coordinator);

            let provider_event: ProviderEvent;

            // Send registration request to coordinator
            let response = Request::new()
                .target(coordinator.clone())
                .body(serde_json::to_vec(&CoordinatorRequest::RegisterProvider {
                    supported_models: state.supported_models.clone(),
                })?)
                .send_and_await_response(30)??;

            let response_data = match serde_json::from_slice(response.body())? {
                CoordinatorResponse::ProviderRegistered { required_models } => {
                    kiprintln!("Registration successful!");
                    provider_event = ProviderEvent::RegisterWithCoordinator(coordinator.clone());
                    
                    serde_json::json!({
                        "status": "success",
                        "required_models": required_models
                    })
                }
                CoordinatorResponse::RegistrationRejected { reason } => {
                    kiprintln!("Registration rejected. Reason: {:#?}", reason);
                    provider_event = ProviderEvent::Error(reason.clone());
                    
                    serde_json::json!({
                        "status": "error",
                        "message": reason
                    })
                }
                CoordinatorResponse::Ack => {
                    kiprintln!("Already in network");
                    // this could allow providers to bypass the model check. TODO: Create handshake protocol
                    provider_event = ProviderEvent::RegisterWithCoordinator(coordinator.clone());

                    serde_json::json!({
                        "status": "success",
                    })
                }
                CoordinatorResponse::Nack => {
                    provider_event = ProviderEvent::RegisterWithCoordinator(coordinator.clone());
                    
                    serde_json::json!({
                        "status": "error",
                        "message": "Nack received"
                    })
                }
                _ => return Err(anyhow::anyhow!("unexpected coordinator response")),
            };


            http::server::send_response(
                http::StatusCode::OK,
                Some(std::collections::HashMap::from([(
                    String::from("Content-Type"),
                    String::from("application/json"),
                )])),
                serde_json::to_vec(&response_data)?,
            );

            for &channel_id in channel_ids {
                state.safe_transition(provider_event.clone(), channel_id)?;
            }
        }
        "/coordinators" => {
            // TODO: Hardcoded coordinator list for now, but should be something else
            let coordinators = serde_json::json!([{
                "address": "pertinent.os",
                "requiredModels": ["clip-vit-base-patch16"],
            }]);

            http::server::send_response(
                http::StatusCode::OK,
                Some(std::collections::HashMap::from([(
                    String::from("Content-Type"),
                    String::from("application/json"),
                )])),
                serde_json::to_vec(&coordinators)?,
            );
        }
        _ => return Err(anyhow::anyhow!("unknown endpoint")),
    }

    Ok(())
}

fn handle_http_server_message(
    state: &mut State,
    channel_ids: &mut HashSet<u32>,
    message: &Message,
) -> anyhow::Result<()> {
    match serde_json::from_slice(message.body())? {
        HttpServerRequest::Http(req) => handle_http_request(state, channel_ids, req),
        HttpServerRequest::WebSocketOpen { channel_id, .. } => {
            channel_ids.insert(channel_id);
            Ok(())
        }
        HttpServerRequest::WebSocketClose(channel_id) => {
            if channel_ids.remove(&channel_id) {
                // Only notify if we actually removed a channel
                //notify_ui_state_change(state, channel_ids)?;
            }
            Ok(())
        }
        HttpServerRequest::WebSocketPush { channel_id, .. } => {
            if !channel_ids.contains(&channel_id) {
                return Err(anyhow::anyhow!("received push from unknown channel"));
            }
            
            if let Some(blob) = get_blob() {
                let ws_message: WebSocketMessage = serde_json::from_slice(&blob.bytes)?;
                handle_websocket_message(state, channel_id, ws_message)?;
            }
            Ok(())
        }
        _ => Err(anyhow::anyhow!("unknown http server request: {:?}", message.body())),
    }
}

fn handle_message(
    _our: &Address,
    state: &mut State, 
    channel_ids: &mut HashSet<u32>,
) -> anyhow::Result<()> {
    let message = await_message()?;

    if message.source().process == "http_server:distro:sys" {
        handle_http_server_message(state, channel_ids, &message)?;
    } else {
        handle_coordinator_message(state, channel_ids, &message)?;
    }
    Ok(())
}

fn serve_http_and_bind_paths(our: &Address) -> anyhow::Result<HttpServer> {
    let mut server = HttpServer::new(5);
    
    let config = HttpBindingConfig::new(false, false, false, None);

    match server.bind_ws_path("/", http::server::WsBindingConfig::new(
        false, false, false, false
    )) {
        Ok(_) => println!("Successfully bound WebSocket path"),
        Err(e) => println!("Failed to bind WebSocket path: {:?}", e),
    }

    server.bind_http_path("/register_provider", config.clone())?;
    server.bind_http_path("/coordinators", config.clone())?;

    // Serve UI
    server.serve_ui(our, "ui", vec!["/"], config)?;

    Ok(server)
}


call_init!(init);
fn init(our: Address) -> anyhow::Result<()> {
    println!("provider: begin");

    let mut state = match kinode_process_lib::get_state() {
        Some(bytes) => bincode::deserialize(&bytes)
            .unwrap_or_else(|_| State::new()),
        None => State::new()
    };
    //let mut state = State::new();

    let mut channel_ids: HashSet<u32> = HashSet::new();
    
    let mut _http_server = serve_http_and_bind_paths(&our)
        .expect("failed to bind paths");

    loop {
        if let Err(e) = handle_message(&our, &mut state, &mut channel_ids) {
            kiprintln!("Error handling message: {e}");
        }
    }
}
