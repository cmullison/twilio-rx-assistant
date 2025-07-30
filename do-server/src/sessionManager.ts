import { Session, WebSocketMessage } from './types';
import functions from './functionHandlers';
import { HoldMusicService } from './holdMusicService';

export class SessionManager implements DurableObject {
  private session: Session = {};
  private websockets: Map<string, WebSocket> = new Map();
  private holdMusicService: HoldMusicService;
  private cleanupTimer?: any;
  private readonly CLEANUP_TIMEOUT = 300000; // 5 minutes
  private readonly ACTIVITY_CHECK_INTERVAL = 60000; // 1 minute

  constructor(private ctx: DurableObjectState, private env: any) {
    this.holdMusicService = new HoldMusicService(env.TRACKS);
    this.initializeSession();
  }

  private initializeSession(): void {
    const now = Date.now();
    this.session.createdAt = now;
    this.session.lastActivity = now;
    this.scheduleActivityCheck();
  }

  private updateActivity(): void {
    this.session.lastActivity = Date.now();
  }

  private scheduleActivityCheck(): void {
    // Clear existing timer
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }
    
    // Schedule next check
    this.cleanupTimer = setTimeout(() => {
      this.checkAndCleanup();
    }, this.ACTIVITY_CHECK_INTERVAL);
  }

  private checkAndCleanup(): void {
    const now = Date.now();
    const lastActivity = this.session.lastActivity || 0;
    const timeSinceActivity = now - lastActivity;
    
    // If no connections and inactive for more than cleanup timeout, self-destruct
    if (this.websockets.size === 0 && timeSinceActivity > this.CLEANUP_TIMEOUT) {
      console.log(`Session ${this.session.sessionId} auto-cleaning up due to inactivity`);
      this.cleanupAllConnections();
      return;
    }
    
    // If call ended but frontend is still connected, give it some time
    if (!this.session.twilioConnId && !this.session.callSid && timeSinceActivity > this.CLEANUP_TIMEOUT / 2) {
      console.log(`Session ${this.session.sessionId} cleaning up after call ended`);
      this.cleanupAllConnections();
      return;
    }
    
    // Schedule next check
    this.scheduleActivityCheck();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);
    
    // Handle non-WebSocket requests for broadcasting and storage
    if (request.headers.get('Upgrade') !== 'websocket') {
      return this.handleHttpRequest(request, url, path);
    }

    const type = parts[0];
    
    if (type !== 'call' && type !== 'logs') {
      return new Response('Invalid WebSocket type', { status: 400 });
    }

    // Extract and store session ID if not already set
    if (!this.session.sessionId) {
      // Try to get session info from URL parameters
      const sessionIdFromUrl = url.searchParams.get('sessionId') || 
                              url.searchParams.get('callSid');
      if (sessionIdFromUrl) {
        this.session.sessionId = sessionIdFromUrl;
        console.log('Session ID set from URL:', this.session.sessionId);
      }
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

  private async handleHttpRequest(request: Request, url: URL, path: string): Promise<Response> {
    try {
      switch (path) {
        case '/broadcast':
          return this.handleBroadcast(request);
        case '/store':
          return this.handleStore(request);
        case '/verify':
          return this.handleVerify(request);
        case '/store-caller':
          return this.handleStoreCaller(request);
        case '/verify-digits':
          return this.handleVerifyDigits(request);
        case '/store-broadcast':
          return this.handleStoreBroadcast(request);
        case '/get-broadcasts':
          return this.handleGetBroadcasts(request);
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Error handling HTTP request:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  private async handleWebSocket(ws: WebSocket, type: string): Promise<void> {
    const connectionId = this.generateConnectionId();
    
    ws.accept();
    this.websockets.set(connectionId, ws);
    this.updateActivity(); // Mark activity on new connection

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
      this.updateActivity(); // Mark activity on close
      
      if (type === 'call' && this.session.twilioConnId === connectionId) {
        this.cleanupCallConnection();
      } else if (type === 'logs' && this.session.frontendConnId === connectionId) {
        this.session.frontendConnId = undefined;
      }
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.websockets.delete(connectionId);
      this.updateActivity(); // Mark activity on error
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
    // Allow multiple frontend connections - don't close existing ones
    // Just update the frontendConnId to the latest connection for any single-connection operations
    this.session.frontendConnId = connectionId;
    
    // No replay - live transcript only from this point forward
    console.log('Frontend connected for live transcript');
  }

  private async handleTwilioMessage(msg: any, ws: WebSocket, connectionId: string): Promise<void> {
    if (!msg) return;
    
    this.updateActivity(); // Track activity on every message

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
    
    this.updateActivity(); // Track activity on every message

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
      console.log('Frontend configuration updated');
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
      console.log('Connecting to OpenAI Realtime API...');
      
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

      const modelConnectionId = this.generateConnectionId();
      this.session.modelConnId = modelConnectionId;

      // Check if WebSocket is already open (likely when using fetch)
      if (modelWs.readyState === WebSocket.READY_STATE_OPEN) {
        console.log('OpenAI WebSocket connected');
        this.websockets.set(modelConnectionId, modelWs);
      } else {
        modelWs.addEventListener('open', () => {
          console.log('OpenAI WebSocket connected');
          this.websockets.set(modelConnectionId, modelWs);
          // Note: Don't send session.update immediately - wait for session.created event
        });
      }

      modelWs.addEventListener('message', async (event: any) => {
        try {
          await this.handleModelMessage(JSON.parse(event.data as string));
        } catch (error) {
          console.error('Error parsing OpenAI message:', error);
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
    if (!event) return;

    // Forward to frontend if connected (live transcript only)
    if (this.session.frontendConnId) {
      const frontendWs = this.websockets.get(this.session.frontendConnId);
      if (frontendWs && frontendWs.readyState === WebSocket.READY_STATE_OPEN) {
        this.sendToWebSocket(frontendWs, event);
      }
    }

    // Broadcast transcript events to all frontends via shared logs session
    if (this.shouldBroadcastToFrontends(event)) {
      await this.broadcastToSharedLogsSession(event);
    }

    switch (event.type) {
      case 'session.created':
        // NOW send our session configuration after OpenAI creates the session
        const config = this.session.config || {};
        console.log('Applying session configuration:', config.voice || 'ash');
        
        if (this.session.modelConnId) {
          const modelWs = this.websockets.get(this.session.modelConnId);
          if (modelWs && modelWs.readyState === WebSocket.READY_STATE_OPEN) {
            // Merge backend functions with frontend tools
            const backendTools = functions.map(f => f.schema);
            const frontendTools = config.tools || [];
            const allTools = [...backendTools, ...frontendTools];

            this.sendToWebSocket(modelWs, {
              type: 'session.update',
              session: {
                modalities: ['text', 'audio'],
                turn_detection: { type: 'server_vad' },
                voice: 'sage', // Default fallback
                input_audio_transcription: { model: 'whisper-1' },
                input_audio_format: 'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                ...config, // Frontend config OVERRIDES defaults (including voice)
                tools: allTools, // Ensure tools don't get overridden
              },
            });

            // Add greeting message
            this.sendToWebSocket(modelWs, {
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'system',
                content: [
                  {
                    type: 'input_text',
                    text: "When the call starts, greet the caller by saying 'Thank you for calling Fluffhead Pharmacy, where our intent is all for your delight. This is the pharmacist speaking, how may I assist you today?'"
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
    
    // Update activity and schedule cleanup check since call ended
    this.updateActivity();
    this.scheduleActivityCheck();
  }

  private cleanupAllConnections(): void {
    // Clean up hold music when connections close
    this.holdMusicService.resetHoldMusicState();
    
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    for (const [id, ws] of this.websockets) {
      if (ws.readyState === WebSocket.READY_STATE_OPEN) {
        ws.close();
      }
    }
    this.websockets.clear();
    
    // Complete session reset
    this.session = {};
    
    console.log('Session cleaned up completely');
  }

  private sendToWebSocket(ws: WebSocket, obj: any): void {
    if (ws.readyState === WebSocket.READY_STATE_OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }



  private shouldBroadcastToFrontends(event: any): boolean {
    // Broadcast events that frontends need to see for real-time transcript
    const broadcastEvents = [
      'session.created',
      'input_audio_buffer.speech_started',
      'conversation.item.created',
      'conversation.item.input_audio_transcription.completed',
      'response.content_part.added',
      'response.audio_transcript.delta',
      'response.output_item.done'
    ];
    
    return broadcastEvents.includes(event.type);
  }

  private async broadcastToSharedLogsSession(event: any): Promise<void> {
    try {
      // Send to the shared logs session where all frontends are connected
      const logsSessionId = this.env.SESSION_MANAGER.idFromName('logs-shared');
      const logsSession = this.env.SESSION_MANAGER.get(logsSessionId);
      
      await logsSession.fetch(new Request('https://dummy.com/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }));
      
      console.log(`Broadcast transcript event to frontends: ${event.type}`);
    } catch (error) {
      console.error('Error broadcasting transcript to frontends:', error);
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

  /**
   * Handle broadcasting messages to frontend sessions
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const message = await request.json() as any;
      let broadcastCount = 0;
      
      // Broadcast to ALL frontend WebSocket connections
      for (const [connId, ws] of this.websockets.entries()) {
        if (ws.readyState === WebSocket.READY_STATE_OPEN) {
          this.sendToWebSocket(ws, message);
          broadcastCount++;
        }
      }

      console.log(`Broadcasted ${message.type} to ${broadcastCount} frontend connections`);
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error broadcasting message:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Handle storing call assignments
   */
  private async handleStore(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const data = await request.json() as { sessionId: string; timestamp: number };
      
      // Store the assignment in the session
      this.session.assignedTo = data.sessionId;
      this.session.assignedAt = data.timestamp;
      
      console.log('Stored call assignment:', { 
        callSid: this.session.callSid,
        assignedTo: data.sessionId,
        timestamp: data.timestamp
      });

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error storing call assignment:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Handle verifying call assignments
   */
  private async handleVerify(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const data = await request.json() as { sessionId: string };
      
      const isValid = this.session.assignedTo === data.sessionId;
      
      console.log('Verified call assignment:', {
        callSid: this.session.callSid,
        sessionId: data.sessionId,
        assignedTo: this.session.assignedTo,
        valid: isValid
      });

      return new Response(
        JSON.stringify({ valid: isValid }),
        { 
          headers: { 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    } catch (error) {
      console.error('Error verifying call assignment:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Handle storing broadcast messages
   */
  private async handleStoreBroadcast(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const data = await request.json() as any;
      const { message, timestamp, messageId } = data;
      
      // Store in session state (this will persist in Durable Object)
      if (!this.session.broadcastMessages) {
        this.session.broadcastMessages = [];
      }
      
      this.session.broadcastMessages.push({
        messageId,
        message,
        timestamp,
        delivered: false
      });
      
      // Keep only last 10 messages to prevent memory bloat
      if (this.session.broadcastMessages.length > 10) {
        this.session.broadcastMessages = this.session.broadcastMessages.slice(-10);
      }
      
      console.log('Stored broadcast message:', messageId, message.type);
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error storing broadcast message:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Handle getting pending broadcast messages
   */
  private async handleGetBroadcasts(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const lastMessageId = url.searchParams.get('lastMessageId');
      
      if (!this.session.broadcastMessages) {
        this.session.broadcastMessages = [];
      }
      
      // Get new messages since lastMessageId
      let newMessages = this.session.broadcastMessages.filter(msg => !msg.delivered);
      
      if (lastMessageId) {
        const lastIndex = this.session.broadcastMessages.findIndex(msg => msg.messageId === lastMessageId);
        if (lastIndex >= 0) {
          newMessages = this.session.broadcastMessages.slice(lastIndex + 1);
        }
      }
      
      return new Response(JSON.stringify(newMessages), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error getting broadcast messages:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Handle storing caller phone numbers
   */
  private async handleStoreCaller(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const data = await request.json() as { callerNumber: string; timestamp: number };
      
      // Store the caller number in the session
      this.session.callerNumber = data.callerNumber;
      this.session.callerTimestamp = data.timestamp;
      
      console.log('Stored caller number:', { 
        callSid: this.session.callSid,
        callerNumber: data.callerNumber.replace(/(\d{6})\d{4}/, '$1xxxx'), // Log with masked digits
        timestamp: data.timestamp
      });

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error storing caller number:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Handle verifying last 4 digits
   */
  private async handleVerifyDigits(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const data = await request.json() as { lastFourDigits: string };
      
      if (!this.session.callerNumber) {
        console.log('No caller number stored for verification');
        return new Response(
          JSON.stringify({ valid: false }),
          { 
            headers: { 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }

      // Extract last 4 digits from stored caller number
      const cleanCallerNumber = this.session.callerNumber.replace(/\D/g, '');
      const actualLastFour = cleanCallerNumber.slice(-4);
      
      const isValid = actualLastFour === data.lastFourDigits;
      
      console.log('Verified last four digits:', {
        callSid: this.session.callSid,
        inputDigits: data.lastFourDigits,
        valid: isValid
      });

      return new Response(
        JSON.stringify({ valid: isValid }),
        { 
          headers: { 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    } catch (error) {
      console.error('Error verifying last four digits:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
} 