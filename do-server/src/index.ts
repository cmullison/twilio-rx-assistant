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

        default:
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
  const wsUrl = new URL(env.PUBLIC_URL);
  wsUrl.protocol = 'wss:';
  wsUrl.pathname = '/call';

  const twimlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl.toString()}" />
  </Connect>
  <Say>Disconnected</Say>
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

  // Get or create a Durable Object instance for session management
  const sessionId = 'session'; // For now, use a single session
  const sessionManagerId = env.SESSION_MANAGER.idFromName(sessionId);
  const sessionManager = env.SESSION_MANAGER.get(sessionManagerId);

  // Forward the WebSocket request to the Durable Object
  return sessionManager.fetch(request);
} 