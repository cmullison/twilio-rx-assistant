import { WorkerEnv } from './types';
import functions from './functionHandlers';
import { SessionManager } from './sessionManager';
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/cloudflare-workers';

export { SessionManager };

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Add CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route HTTP endpoints
      switch (path) {
        case '/public-url':
          return handlePublicUrl(env, corsHeaders);

        case '/twiml':
          return handleTwiml(env, corsHeaders);

        case '/tools':
          return handleTools(corsHeaders);

        case '/twilio/credentials':
          return handleTwilioCredentials(env, corsHeaders);

        case '/twilio/numbers':
          if (request.method === 'GET') {
            return handleTwilioNumbersGet(env, corsHeaders);
          } else if (request.method === 'POST') {
            return handleTwilioNumbersPost(request, env, corsHeaders);
          }
          return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

        case '/twilio/webhook-url':
          return handleTwilioWebhookUrl(env, corsHeaders);

        case '/hold-music/status':
          return handleHoldMusicStatus(env, corsHeaders);

        case '/hold-music/files':
          return handleHoldMusicFiles(env, corsHeaders);

        case '/hold-music/stream':
          return handleHoldMusicStream(env, corsHeaders);

        case '/incoming-call':
          if (request.method === 'POST') {
            return handleIncomingCall(request, env, corsHeaders);
          }
          return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

        case '/claim-call':
          if (request.method === 'POST') {
            return handleClaimCall(request, env, corsHeaders);
          }
          return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

        case '/connect-call':
          if (request.method === 'POST') {
            return handleConnectCall(request, env, corsHeaders);
          }
          return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

        default:
          // Handle broadcast registry routes
          if (path.startsWith('/broadcast-registry/')) {
            const broadcastRegistryId = env.SESSION_MANAGER.idFromName('broadcast-registry');
            const broadcastRegistry = env.SESSION_MANAGER.get(broadcastRegistryId);
            
            // Strip the /broadcast-registry prefix and forward the request
            const strippedPath = path.replace('/broadcast-registry', '');
            const modifiedUrl = new URL(request.url);
            modifiedUrl.pathname = strippedPath;
            
            const modifiedRequest = new Request(modifiedUrl.toString(), {
              method: request.method,
              headers: request.headers,
              body: request.body,
            });
            
            return broadcastRegistry.fetch(modifiedRequest);
          }

          // Check if this is a WebSocket upgrade request
          if (request.headers.get('Upgrade') === 'websocket') {
            return handleWebSocket(request, env, path);
          }

          return new Response('Not Found', { 
            status: 404, 
            headers: corsHeaders 
          });
      }
    } catch (error) {
      console.error('Error handling request:', error);
      return new Response('Internal Server Error', { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  },
};

function handlePublicUrl(env: WorkerEnv, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ publicUrl: env.PUBLIC_URL }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

function handleTwiml(env: WorkerEnv, corsHeaders: Record<string, string>): Response {
  const callbackUrl = new URL(env.PUBLIC_URL);
  callbackUrl.pathname = '/incoming-call';

  const twimlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You have reached the Fluffhead Pharmacy demo system. Please wait while we connect you to an available agent.</Say>
  <Redirect>${callbackUrl.toString()}</Redirect>
</Response>`;

  return new Response(twimlContent, {
    headers: {
      'Content-Type': 'text/xml',
      ...corsHeaders,
    },
  });
}

function handleTools(corsHeaders: Record<string, string>): Response {
  const schemas = functions.map((f) => f.schema);
  
  return new Response(
    JSON.stringify(schemas),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

function handleTwilioCredentials(env: WorkerEnv, corsHeaders: Record<string, string>): Response {
  const credentialsSet = Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
  );
  return new Response(
    JSON.stringify({ credentialsSet }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

async function handleTwilioNumbersGet(env: WorkerEnv, corsHeaders: Record<string, string>): Promise<Response> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Twilio credentials not configured" }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }

  try {
    const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`, {
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Twilio API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return new Response(
      JSON.stringify(data.incoming_phone_numbers || []),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error('Error fetching Twilio numbers:', error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch phone numbers" }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}

async function handleTwilioNumbersPost(request: Request, env: WorkerEnv, corsHeaders: Record<string, string>): Promise<Response> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Twilio credentials not configured" }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }

  try {
    const body = await request.json() as { phoneNumberSid: string; voiceUrl: string };
    const { phoneNumberSid, voiceUrl } = body;

    const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
    const formData = new URLSearchParams();
    formData.append('VoiceUrl', voiceUrl);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Twilio API error: ${response.status}`);
    }

    const data = await response.json();
    return new Response(
      JSON.stringify(data),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    console.error('Error updating Twilio number:', error);
    return new Response(
      JSON.stringify({ error: "Failed to update phone number" }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}

function handleTwilioWebhookUrl(env: WorkerEnv, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ webhookUrl: env.PUBLIC_URL }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

async function handleHoldMusicStatus(env: WorkerEnv, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Get session manager to check hold music status
    const sessionId = 'session';
    const sessionManagerId = env.SESSION_MANAGER.idFromName(sessionId);
    const sessionManager = env.SESSION_MANAGER.get(sessionManagerId);
    
    // This would require adding a method to check status via HTTP
    // For now, return basic info
    return new Response(
      JSON.stringify({ 
        message: 'Use WebSocket connection to get real-time hold music status',
        endpoints: {
          websocket: '/logs',
          files: '/hold-music/files'
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to get hold music status' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}

async function handleHoldMusicFiles(env: WorkerEnv, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // List available audio files in R2 bucket
    const result = await env.TRACKS.list({ prefix: '' });
    const files = result.objects?.map((obj: any) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded
    })) || [];
    
    return new Response(
      JSON.stringify({ 
        files,
        totalFiles: files.length,
        supportedFormats: ['.raw', '.mp3', '.wav'] 
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to list audio files' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}

async function handleHoldMusicStream(env: WorkerEnv, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    // Use the MP3 file which is more compatible with Twilio
    const audioFile = await env.TRACKS.get('breakaway.mp3');
    
    if (!audioFile) {
      return new Response('Hold music file not found', { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // Get the audio data as ArrayBuffer
    const audioData = await audioFile.arrayBuffer();

    // Stream the audio file with appropriate headers for Twilio
    return new Response(audioData, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Error streaming hold music:', error);
    return new Response('Failed to stream hold music', { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

async function handleWebSocket(request: Request, env: WorkerEnv, path: string): Promise<Response> {
  console.log('WebSocket request received for path:', path);
  const parts = path.split('/').filter(Boolean);
  console.log('Path parts:', parts);
  
  if (parts.length < 1) {
    console.log('No path parts found');
    return new Response('Bad Request', { status: 400 });
  }

  const type = parts[0];
  console.log('WebSocket type:', type);
  
  if (type !== 'call' && type !== 'logs') {
    console.log('Invalid WebSocket type:', type);
    return new Response('Bad Request', { status: 400 });
  }

  // Extract CallSid for session routing
  const sessionId = extractSessionId(request, type, parts);
  console.log('Using session ID:', sessionId);
  
  const sessionManagerId = env.SESSION_MANAGER.idFromName(sessionId);
  const sessionManager = env.SESSION_MANAGER.get(sessionManagerId);

  // Forward the WebSocket request to the Durable Object
  return sessionManager.fetch(request);
}

/**
 * Extract session ID from request for routing to appropriate DO instance
 * Priority: CallSid from WebSocket subprotocol > CallSid from URL path > CallSid from URL params > CallSid from headers > Generated ID
 */
function extractSessionId(request: Request, type: string, pathParts?: string[]): string {
  const url = new URL(request.url);
  
  console.log('DEBUG: Full URL received:', request.url);
  console.log('DEBUG: URL pathname:', url.pathname);
  console.log('DEBUG: URL search params:', url.search);
  console.log('DEBUG: All search params:', Array.from(url.searchParams.entries()));
  console.log('DEBUG: Path parts:', pathParts);
  
  // Try to get CallSid from WebSocket subprotocol header (Sec-WebSocket-Protocol)
  const subprotocol = request.headers.get('Sec-WebSocket-Protocol');
  if (subprotocol) {
    console.log('DEBUG: WebSocket subprotocol:', subprotocol);
    // Subprotocol format: "call-CA123456789"
    if (subprotocol.startsWith('call-CA')) {
      const callSidFromSubprotocol = subprotocol.substring(5); // Remove "call-" prefix
      console.log('Found CallSid in WebSocket subprotocol:', callSidFromSubprotocol);
      return `call-${callSidFromSubprotocol}`;
    }
  }
  
  // For call WebSockets, try to get CallSid from URL path (e.g., /call/CA123...)
  if (type === 'call' && pathParts && pathParts.length >= 2) {
    const callSidFromPath = pathParts[1]; // parts[0] is 'call', parts[1] is the callSid
    if (callSidFromPath && callSidFromPath.startsWith('CA')) {
      console.log('Found CallSid in URL path:', callSidFromPath);
      return `call-${callSidFromPath}`;
    }
  }
  
  // Try to get CallSid from URL parameters (fallback for backwards compatibility)
  const callSidFromParams = url.searchParams.get('callSid');
  if (callSidFromParams) {
    console.log('Found CallSid in URL params:', callSidFromParams);
    return `call-${callSidFromParams}`;
  }
  
  // Try to get CallSid from headers (Twilio webhooks)
  const callSidFromHeaders = request.headers.get('X-Twilio-CallSid');
  if (callSidFromHeaders) {
    console.log('Found CallSid in headers:', callSidFromHeaders);
    return `call-${callSidFromHeaders}`;
  }
  
  // For 'logs' type connections (frontend), use a shared session for broadcasts
  if (type === 'logs') {
    // All frontend connections share the same session for broadcasts
    console.log('Using shared logs session for frontend broadcasts');
    return 'logs-shared';
  }
  
  // Fallback: generate a unique session ID with timestamp
  const fallbackId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  console.log('Generated fallback session ID:', fallbackId);
  return fallbackId;
}

/**
 * Handle incoming call notification - broadcast to all active frontend sessions
 */
async function handleIncomingCall(request: Request, env: WorkerEnv, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const from = formData.get('From') as string;
    
    if (!callSid || !from) {
      return new Response('Missing required parameters', { status: 400, headers: corsHeaders });
    }

    // Extract partial phone number (first 6 digits, last 4 as 'xxxx')
    const cleanNumber = from.replace(/\D/g, ''); // Remove non-digits
    const partialNumber = cleanNumber.length >= 10 
      ? `${cleanNumber.slice(0, 6)}xxxx`
      : `${cleanNumber}xxxx`;

    console.log('Incoming call:', { callSid, from, partialNumber });

    // Store the full caller number for verification
    await storeCallerNumber(env, callSid, from);

    // Broadcast to all active frontend sessions
    await broadcastToAllFrontends(env, {
      type: 'incoming_call',
      callSid,
      partialNumber,
      timestamp: Date.now()
    });

    // Return holding TwiML with our R2 hold music
    let holdMusicUrl = `${env.PUBLIC_URL}/hold-music/stream`;
    // Force HTTPS for Twilio compatibility
    holdMusicUrl = holdMusicUrl.replace('http://', 'https://');
    
    const twimlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please hold while we connect you.</Say>
  <Play loop="3">${holdMusicUrl}</Play>
  <Say>We're still trying to connect you. Please hold.</Say>
  <Redirect>/incoming-call</Redirect>
</Response>`;

    return new Response(twimlContent, {
      headers: {
        'Content-Type': 'text/xml',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Error handling incoming call:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
}

/**
 * Handle call claiming - verify last 4 digits and assign call to session
 */
async function handleClaimCall(request: Request, env: WorkerEnv, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as { 
      callSid: string; 
      lastFourDigits: string; 
      sessionId: string;
    };
    
    const { callSid, lastFourDigits, sessionId } = body;

    if (!callSid || !lastFourDigits || !sessionId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required parameters' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Validate format
    if (!/^\d{4}$/.test(lastFourDigits)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid format. Please enter 4 digits.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Verify against the actual caller's last 4 digits
    const isValidDigits = await verifyLastFourDigits(env, callSid, lastFourDigits);
    if (!isValidDigits) {
      return new Response(
        JSON.stringify({ success: false, message: 'Incorrect digits. Please check the caller number.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.log('Call claimed:', { callSid, sessionId, lastFourDigits });

    // Store the call assignment
    await storeCallAssignment(env, callSid, sessionId);

    // Redirect the live call to WebSocket using Twilio Call Control API
    const redirectSuccess = await redirectCallToWebSocket(env, callSid, sessionId);
    if (!redirectSuccess) {
      return new Response(
        JSON.stringify({ success: false, message: 'Failed to redirect call. Call may have ended.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Notify other frontends that this call was claimed
    await broadcastToAllFrontends(env, {
      type: 'call_claimed',
      callSid,
      claimedBy: sessionId,
      timestamp: Date.now()
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Call connected successfully',
        callSid,
        sessionId
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('Error claiming call:', error);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

/**
 * Handle call connection - connect the verified session to the call WebSocket
 */
async function handleConnectCall(request: Request, env: WorkerEnv, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const url = new URL(request.url);
    const callSid = url.searchParams.get('callSid');
    const sessionId = url.searchParams.get('sessionId');

    if (!callSid || !sessionId) {
      return new Response('Missing required parameters', { status: 400, headers: corsHeaders });
    }

    // Verify this session claimed this call
    const isValidClaim = await verifyCallAssignment(env, callSid, sessionId);
    if (!isValidClaim) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Generate WebSocket URL for this specific call using path-based routing
    const wsUrl = new URL(env.PUBLIC_URL);
    wsUrl.protocol = 'wss:';
    wsUrl.pathname = `/call/${callSid}`;

    const twimlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl.toString()}" />
  </Connect>
  <Say>Call ended</Say>
</Response>`;

    return new Response(twimlContent, {
      headers: {
        'Content-Type': 'text/xml',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Error connecting call:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
}

/**
 * Broadcast message to all active frontend sessions
 */
async function broadcastToAllFrontends(env: WorkerEnv, message: any): Promise<void> {
  // Send to the shared logs session where all frontends are connected
  const logsSessionId = env.SESSION_MANAGER.idFromName('logs-shared');
  const logsSession = env.SESSION_MANAGER.get(logsSessionId);
  
  try {
    await logsSession.fetch(new Request('https://dummy.com/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    }));
    console.log('Broadcast sent to shared logs session:', message.type);
  } catch (error) {
    console.error('Error broadcasting to frontends:', error);
  }
}

/**
 * Store call assignment in Durable Object storage
 */
async function storeCallAssignment(env: WorkerEnv, callSid: string, sessionId: string): Promise<void> {
  const assignmentSessionId = env.SESSION_MANAGER.idFromName(`assignment-${callSid}`);
  const assignmentSession = env.SESSION_MANAGER.get(assignmentSessionId);
  
  await assignmentSession.fetch(new Request('https://dummy.com/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, timestamp: Date.now() })
  }));
}

/**
 * Verify call assignment from Durable Object storage
 */
async function verifyCallAssignment(env: WorkerEnv, callSid: string, sessionId: string): Promise<boolean> {
  const assignmentSessionId = env.SESSION_MANAGER.idFromName(`assignment-${callSid}`);
  const assignmentSession = env.SESSION_MANAGER.get(assignmentSessionId);
  
  try {
    const response = await assignmentSession.fetch(new Request('https://dummy.com/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    }));
    
    const result = await response.json() as { valid: boolean };
    return result.valid;
  } catch (error) {
    console.error('Error verifying call assignment:', error);
    return false;
  }
}

/**
 * Store the caller's phone number for verification
 */
async function storeCallerNumber(env: WorkerEnv, callSid: string, callerNumber: string): Promise<void> {
  const callerSessionId = env.SESSION_MANAGER.idFromName(`caller-${callSid}`);
  const callerSession = env.SESSION_MANAGER.get(callerSessionId);
  
  await callerSession.fetch(new Request('https://dummy.com/store-caller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callerNumber, timestamp: Date.now() })
  }));
}

/**
 * Verify the last 4 digits against the stored caller number
 */
async function verifyLastFourDigits(env: WorkerEnv, callSid: string, lastFourDigits: string): Promise<boolean> {
  const callerSessionId = env.SESSION_MANAGER.idFromName(`caller-${callSid}`);
  const callerSession = env.SESSION_MANAGER.get(callerSessionId);
  
  try {
    const response = await callerSession.fetch(new Request('https://dummy.com/verify-digits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastFourDigits })
    }));
    
    const result = await response.json() as { valid: boolean };
    return result.valid;
  } catch (error) {
    console.error('Error verifying last four digits:', error);
    return false;
  }
}

/**
 * Redirect live call to WebSocket using Twilio Call Control API
 */
async function redirectCallToWebSocket(env: WorkerEnv, callSid: string, sessionId: string): Promise<boolean> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    console.error('Twilio credentials not configured');
    return false;
  }

  try {
    // Generate WebSocket URL for this specific call using path-based routing
    const wsUrl = new URL(env.PUBLIC_URL);
    wsUrl.protocol = 'wss:';
    wsUrl.pathname = `/call/${callSid}`;

    const twimlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl.toString()}" />
  </Connect>
  <Say>Call ended</Say>
</Response>`;

    // Use Twilio Call Control API to redirect the live call
    const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
    const formData = new URLSearchParams();
    formData.append('Twiml', twimlContent);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      console.error('Twilio Call Control API error:', response.status, await response.text());
      return false;
    }

    console.log('Successfully redirected call to WebSocket:', { callSid, sessionId });
    return true;
  } catch (error) {
    console.error('Error redirecting call to WebSocket:', error);
    return false;
  }
} 