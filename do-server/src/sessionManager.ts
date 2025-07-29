import { Session, WebSocketMessage } from './types';
import functions from './functionHandlers';
import { HoldMusicService } from './holdMusicService';

export class SessionManager implements DurableObject {
  private session: Session = {};
  private websockets: Map<string, WebSocket> = new Map();
  private holdMusicService: HoldMusicService;

  constructor(private ctx: DurableObjectState, private env: any) {
    this.holdMusicService = new HoldMusicService(env.TRACKS);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);
    
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    const type = parts[0];
    
    if (type !== 'call' && type !== 'logs') {
      return new Response('Invalid WebSocket type', { status: 400 });
    }

    // Create WebSocket pair
    const [client, server] = Object.values(new WebSocketPair());

    // Handle the WebSocket connection
    await this.handleWebSocket(server, type);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleWebSocket(ws: WebSocket, type: string): Promise<void> {
    const connectionId = this.generateConnectionId();
    
    ws.accept();
    this.websockets.set(connectionId, ws);

    if (type === 'call') {
      await this.handleCallConnection(ws, connectionId);
    } else if (type === 'logs') {
      await this.handleFrontendConnection(ws, connectionId);
    }

    ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        
        if (type === 'call') {
          await this.handleTwilioMessage(data, ws, connectionId);
        } else if (type === 'logs') {
          await this.handleFrontendMessage(data, ws, connectionId);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    ws.addEventListener('close', () => {
      this.websockets.delete(connectionId);
      
      if (type === 'call' && this.session.twilioConnId === connectionId) {
        this.cleanupCallConnection();
      } else if (type === 'logs' && this.session.frontendConnId === connectionId) {
        this.session.frontendConnId = undefined;
      }
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.websockets.delete(connectionId);
    });
  }

  private async handleCallConnection(ws: WebSocket, connectionId: string): Promise<void> {
    // Close existing call connection if any
    if (this.session.twilioConnId) {
      const existingWs = this.websockets.get(this.session.twilioConnId);
      if (existingWs) {
        existingWs.close();
      }
    }

    this.session.twilioConnId = connectionId;
    this.session.openAIApiKey = this.env.OPENAI_API_KEY;
  }

  private async handleFrontendConnection(ws: WebSocket, connectionId: string): Promise<void> {
    // Close existing frontend connection if any
    if (this.session.frontendConnId) {
      const existingWs = this.websockets.get(this.session.frontendConnId);
      if (existingWs) {
        existingWs.close();
      }
    }

    this.session.frontendConnId = connectionId;
  }

  private async handleTwilioMessage(msg: any, ws: WebSocket, connectionId: string): Promise<void> {
    if (!msg) return;

    switch (msg.event) {
      case 'start':
        this.session.streamSid = msg.start.streamSid;
        this.session.callSid = msg.start.callSid;
        this.session.latestMediaTimestamp = 0;
        this.session.lastAssistantItem = undefined;
        this.session.responseStartTimestamp = undefined;
        console.log('Call started - Stream SID:', this.session.streamSid, 'Call SID:', this.session.callSid);
        await this.tryConnectModel();
        break;

      case 'media':
        this.session.latestMediaTimestamp = msg.media.timestamp;
        if (this.session.modelConnId) {
          const modelWs = this.websockets.get(this.session.modelConnId);
          if (modelWs && modelWs.readyState === WebSocket.READY_STATE_OPEN) {
            this.sendToWebSocket(modelWs, {
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            });
          }
        }
        break;

      case 'close':
        this.cleanupAllConnections();
        break;
    }
  }

  private async handleFrontendMessage(msg: any, ws: WebSocket, connectionId: string): Promise<void> {
    if (!msg) return;

    // Handle hold music control messages from frontend
    if (msg.type === 'hold_music.start') {
      console.log('Frontend requested hold music start');
      if (!this.holdMusicService.isHoldMusicPlaying()) {
        await this.holdMusicService.startHoldMusic(
          (audioChunk: string) => this.sendAudioToStream(audioChunk),
          msg.holdMusicType
        );
      }
      return;
    }

    if (msg.type === 'hold_music.stop') {
      console.log('Frontend requested hold music stop');
      if (this.holdMusicService.isHoldMusicPlaying()) {
        await this.holdMusicService.stopHoldMusic();
      }
      return;
    }

    // Forward to model connection if available
    if (this.session.modelConnId) {
      const modelWs = this.websockets.get(this.session.modelConnId);
      if (modelWs && modelWs.readyState === WebSocket.READY_STATE_OPEN) {
        this.sendToWebSocket(modelWs, msg);
      }
    }

    if (msg.type === 'session.update') {
      console.log('🎛️ BACKEND: Received frontend config:', JSON.stringify(msg.session, null, 2));
      this.session.config = msg.session;
    }
  }

  private async tryConnectModel(): Promise<void> {
    if (!this.session.twilioConnId || !this.session.streamSid || !this.session.openAIApiKey) {
      return;
    }

    if (this.session.modelConnId) {
      const existingWs = this.websockets.get(this.session.modelConnId);
      if (existingWs && existingWs.readyState === WebSocket.READY_STATE_OPEN) {
        return;
      }
    }

        try {
      console.log('🚀 Starting OpenAI WebSocket connection...');
      
      // Use fetch to establish WebSocket connection with proper headers
      const response = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
          'Authorization': `Bearer ${this.session.openAIApiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      if (!response.webSocket) {
        throw new Error('Failed to get WebSocket from fetch response');
      }

      response.webSocket.accept();
      const modelWs = response.webSocket;
      console.log('🔌 WebSocket accepted, ready state:', modelWs.readyState);

      const modelConnectionId = this.generateConnectionId();
      this.session.modelConnId = modelConnectionId;

      // Check if WebSocket is already open (likely when using fetch)
      if (modelWs.readyState === WebSocket.READY_STATE_OPEN) {
        console.log('🟢 OpenAI WebSocket already open!');
        this.websockets.set(modelConnectionId, modelWs);
      } else {
        modelWs.addEventListener('open', () => {
          console.log('🟢 OpenAI WebSocket connected successfully!');
          this.websockets.set(modelConnectionId, modelWs);
          // Note: Don't send session.update immediately - wait for session.created event
        });
      }

      modelWs.addEventListener('message', async (event: any) => {
        console.log('📨 Raw message from OpenAI:', event.data);
        try {
          await this.handleModelMessage(JSON.parse(event.data as string));
        } catch (error) {
          console.error('❌ Error parsing OpenAI message:', error, 'Raw data:', event.data);
        }
      });

      modelWs.addEventListener('close', () => {
        this.websockets.delete(modelConnectionId);
        this.session.modelConnId = undefined;
      });

      modelWs.addEventListener('error', (error: any) => {
        console.error('Model WebSocket error details:', {
          error: error,
          message: error.message || 'Unknown error',
          type: error.type || 'Unknown type',
          target: error.target || 'Unknown target'
        });
        this.websockets.delete(modelConnectionId);
        this.session.modelConnId = undefined;
      });

    } catch (error) {
      console.error('Error connecting to OpenAI model:', error);
    }
  }

  private async handleModelMessage(event: any): Promise<void> {
    console.log('🤖 BACKEND: Received model message:', event.type);
    if (!event) return;

    // Forward to frontend if connected
    if (this.session.frontendConnId) {
      const frontendWs = this.websockets.get(this.session.frontendConnId);
      if (frontendWs && frontendWs.readyState === WebSocket.READY_STATE_OPEN) {
        this.sendToWebSocket(frontendWs, event);
      }
    }

    switch (event.type) {
      case 'session.created':
        console.log('🎯 BACKEND: session.created event received!');
        // NOW send our session configuration after OpenAI creates the session
        const config = this.session.config || {};
        console.log('🔧 Session config being applied:', JSON.stringify(config, null, 2));
        
        if (this.session.modelConnId) {
          const modelWs = this.websockets.get(this.session.modelConnId);
          if (modelWs && modelWs.readyState === WebSocket.READY_STATE_OPEN) {
            // Merge backend functions with frontend tools
            const backendTools = functions.map(f => f.schema);
            const frontendTools = config.tools || [];
            console.log('🛠️ Backend tools count:', backendTools.length);
            console.log('🎛️ Frontend tools count:', frontendTools.length);
            const allTools = [...backendTools, ...frontendTools];

            const sessionUpdate = {
              type: 'session.update',
              session: {
                modalities: ['text', 'audio'],
                turn_detection: { type: 'server_vad' },
                voice: 'ash', // Default fallback
                input_audio_transcription: { model: 'whisper-1' },
                input_audio_format: 'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                ...config, // Frontend config OVERRIDES defaults (including voice)
                tools: allTools, // Ensure tools don't get overridden
              },
            };
            
            console.log('📤 Sending session update:', JSON.stringify(sessionUpdate, null, 2));
            this.sendToWebSocket(modelWs, sessionUpdate);

            // Add greeting message
            this.sendToWebSocket(modelWs, {
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'system',
                content: [
                  {
                    type: 'input_text',
                    text: "When the call starts, greet the caller by saying 'Thank you for calling Fluff's Pharmacy, where our intent is all for your delight. This is the pharmacist speaking, how may I assist you today?'"
                  }
                ]
              }
            });

            this.sendToWebSocket(modelWs, { type: 'response.create' });
          }
        }
        break;

      case 'input_audio_buffer.speech_started':
        this.handleTruncation();
        break;

      case 'response.audio.delta':
        if (this.session.twilioConnId && this.session.streamSid) {
          if (this.session.responseStartTimestamp === undefined) {
            this.session.responseStartTimestamp = this.session.latestMediaTimestamp || 0;
          }
          if (event.item_id) this.session.lastAssistantItem = event.item_id;

          const twilioWs = this.websockets.get(this.session.twilioConnId);
          if (twilioWs && twilioWs.readyState === WebSocket.READY_STATE_OPEN) {
            this.sendToWebSocket(twilioWs, {
              event: 'media',
              streamSid: this.session.streamSid,
              media: { payload: event.delta },
            });

            this.sendToWebSocket(twilioWs, {
              event: 'mark',
              streamSid: this.session.streamSid,
            });
          }
        }
        break;

      case 'response.output_item.done': {
        const { item } = event;
        if (item.type === 'function_call') {
          // Start hold music when function call begins
          if (!this.holdMusicService.isHoldMusicPlaying()) {
            console.log('Starting hold music for function call');
            await this.holdMusicService.startHoldMusic(
              (audioChunk: string) => this.sendAudioToStream(audioChunk)
            );
          }
          
          await this.handleFunctionCall(item);
        }
        break;
      }
    }
  }

  private async handleFunctionCall(item: { name: string; arguments: string; call_id?: string }): Promise<void> {
    console.log('Handling function call:', item);
    const fnDef = functions.find((f) => f.schema.name === item.name);
    if (!fnDef) {
      throw new Error(`No handler found for function: ${item.name}`);
    }

    let args: unknown;
    try {
      args = JSON.parse(item.arguments);
    } catch {
      console.error('Invalid JSON arguments for function call');
      return;
    }

    try {
      console.log('Calling function:', fnDef.schema.name, args);
      const result = await fnDef.handler(args as any);
      
      // Stop hold music when function completes
      if (this.holdMusicService.isHoldMusicPlaying()) {
        console.log('Stopping hold music after function call completion');
        await this.holdMusicService.stopHoldMusic();
      }
      
      if (this.session.modelConnId) {
        const modelWs = this.websockets.get(this.session.modelConnId);
        if (modelWs && modelWs.readyState === WebSocket.READY_STATE_OPEN) {
          this.sendToWebSocket(modelWs, {
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: item.call_id,
              output: JSON.stringify(result),
            },
          });
          this.sendToWebSocket(modelWs, { type: 'response.create' });
        }
      }
    } catch (err: any) {
      console.error('Error running function:', err);
      
      // Stop hold music even if function fails
      if (this.holdMusicService.isHoldMusicPlaying()) {
        console.log('Stopping hold music after function call error');
        await this.holdMusicService.stopHoldMusic();
      }
    }
  }

  private handleTruncation(): void {
    if (
      !this.session.lastAssistantItem ||
      this.session.responseStartTimestamp === undefined
    )
      return;

    const elapsedMs =
      (this.session.latestMediaTimestamp || 0) - (this.session.responseStartTimestamp || 0);
    const audio_end_ms = elapsedMs > 0 ? elapsedMs : 0;

    if (this.session.modelConnId) {
      const modelWs = this.websockets.get(this.session.modelConnId);
      if (modelWs && modelWs.readyState === WebSocket.READY_STATE_OPEN) {
        this.sendToWebSocket(modelWs, {
          type: 'conversation.item.truncate',
          item_id: this.session.lastAssistantItem,
          content_index: 0,
          audio_end_ms,
        });
      }
    }

    if (this.session.twilioConnId && this.session.streamSid) {
      const twilioWs = this.websockets.get(this.session.twilioConnId);
      if (twilioWs && twilioWs.readyState === WebSocket.READY_STATE_OPEN) {
        this.sendToWebSocket(twilioWs, {
          event: 'clear',
          streamSid: this.session.streamSid,
        });
      }
    }

    this.session.lastAssistantItem = undefined;
    this.session.responseStartTimestamp = undefined;
  }

  private cleanupCallConnection(): void {
    // Clean up hold music when call ends
    this.holdMusicService.resetHoldMusicState();
    
    if (this.session.modelConnId) {
      const modelWs = this.websockets.get(this.session.modelConnId);
      if (modelWs) {
        modelWs.close();
      }
      this.websockets.delete(this.session.modelConnId);
    }

    this.session.twilioConnId = undefined;
    this.session.modelConnId = undefined;
    this.session.streamSid = undefined;
    this.session.callSid = undefined;
    this.session.lastAssistantItem = undefined;
    this.session.responseStartTimestamp = undefined;
    this.session.latestMediaTimestamp = undefined;
  }

  private cleanupAllConnections(): void {
    // Clean up hold music when connections close
    this.holdMusicService.resetHoldMusicState();
    
    for (const [id, ws] of this.websockets) {
      if (ws.readyState === WebSocket.READY_STATE_OPEN) {
        ws.close();
      }
    }
    this.websockets.clear();
    this.session = {};
  }

  private sendToWebSocket(ws: WebSocket, obj: any): void {
    if (ws.readyState === WebSocket.READY_STATE_OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  private generateConnectionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // Function to send audio to Twilio stream
  private sendAudioToStream(audioChunk: string): void {
    if (this.session.twilioConnId && this.session.streamSid) {
      const twilioWs = this.websockets.get(this.session.twilioConnId);
      if (twilioWs && twilioWs.readyState === WebSocket.READY_STATE_OPEN) {
        this.sendToWebSocket(twilioWs, {
          event: 'media',
          streamSid: this.session.streamSid,
          media: { payload: audioChunk },
        });
      }
    }
  }

  // Export function to get hold music status for external use
  getHoldMusicStatus() {
    return {
      isPlaying: this.holdMusicService.isHoldMusicPlaying(),
      callSid: this.session.callSid,
      streamSid: this.session.streamSid
    };
  }
} 