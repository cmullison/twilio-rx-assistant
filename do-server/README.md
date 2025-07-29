# OpenAI Twilio Realtime Worker

A production-ready Cloudflare Workers implementation of OpenAI's Realtime API integrated with Twilio for phone calls. Features sophisticated session management, function calling, and hold music.

## Features

- ✅ **OpenAI Realtime API**: Full WebSocket integration with proper authentication
- ✅ **Twilio Integration**: Seamless phone call handling with media streaming
- ✅ **Session Management**: Persistent state using Durable Objects
- ✅ **Function Calling**: Weather and prescription lookup functions
- ✅ **Hold Music System**: R2 storage with coordinated playback
- ✅ **Configuration UI**: Frontend voice/tool configuration that works

## Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI installed globally: `npm install -g wrangler`

## Key Technical Innovation

### **WebSocket Authentication in Cloudflare Workers**

This implementation solves a critical challenge: **authenticating WebSocket connections to OpenAI's Realtime API from Cloudflare Workers**. The solution uses `fetch()` with upgrade headers:

```typescript
// ✅ WORKING: Proper auth headers during WebSocket handshake
const response = await fetch(
  "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
  {
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      Authorization: `Bearer ${openaiApiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  }
);

const modelWs = response.webSocket;
modelWs.accept();

// 🔑 CRITICAL: Check if already open (doesn't fire 'open' event)
if (modelWs.readyState === WebSocket.READY_STATE_OPEN) {
  this.websockets.set(connectionId, modelWs);
}
```

**Why this works**: Unlike Node.js `ws` library, Cloudflare Workers WebSocket constructor doesn't accept headers. Using `fetch()` allows proper authentication during the handshake.

## Setup

1. **Install dependencies:**

   ```bash
   cd do-server
   npm install
   ```

2. **Authenticate with Cloudflare:**

   ```bash
   wrangler auth login
   ```

3. **Set up environment variables:**

   ```bash
   # Set your OpenAI API key as a secret
   wrangler secret put OPENAI_API_KEY
   ```

4. **Deploy to Cloudflare:**
   ```bash
   npm run deploy
   ```

## Development

Run the worker locally:

```bash
npm run dev
```

This will start the worker on `http://localhost:8787`

## Environment Configuration

### Required Secrets

- `OPENAI_API_KEY`: Your OpenAI API key

### Environment Variables (in wrangler.toml)

- `PUBLIC_URL`: Your worker's public URL

## API Endpoints

### HTTP Endpoints

- `GET /public-url` - Returns the public URL configuration
- `GET|POST /twiml` - Returns TwiML for Twilio webhook
- `GET /tools` - Returns available function schemas
- `GET /hold-music/status` - Returns hold music service info
- `GET /hold-music/files` - Lists available audio files in R2

### WebSocket Endpoints

- `WSS /call` - Twilio media stream connection
- `WSS /logs` - Frontend logging connection

## Architecture

The worker uses Cloudflare Durable Objects for sophisticated session management with proper WebSocket authentication:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Twilio Call   │───▶│  Worker (HTTP)   │───▶│ SessionManager  │
│   (Media Stream)│◀───│  /twiml          │◀───│ (Durable Object)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                       │
┌─────────────────┐    ┌──────────────────┐           │
│  Frontend UI    │───▶│  Worker (WS)     │───────────┤
│  (Config/Logs)  │◀───│  /logs, /call    │◀──────────┤
└─────────────────┘    └──────────────────┘           │
                                                      │
┌─────────────────┐    ┌──────────────────┐           │
│  OpenAI Realtime│◀───│ fetch() + WS     │◀──────────┘
│  (Voice AI)     │───▶│ w/ Auth Headers  │
└─────────────────┘    └──────────────────┘

📡 Key: Fetch-based WebSocket authentication enables proper OpenAI connection
```

### **Session Flow:**

1. **Call connects** → Twilio WebSocket established
2. **OpenAI connects** → fetch() with auth headers → WebSocket accepted
3. **OpenAI sends** `session.created` → Backend responds with user config
4. **Voice flows** → Twilio ↔ OpenAI audio bidirectional streaming
5. **Functions called** → Weather/prescription lookups via tools

## Implementation Status

### ✅ **PRODUCTION READY**

- [x] **OpenAI Realtime API**: Full working integration with authentication
- [x] **Twilio Integration**: Phone calls with media streaming
- [x] **Session Management**: Persistent state with Durable Objects
- [x] **Function Calling**: Weather + prescription lookup tools
- [x] **Voice Configuration**: Frontend UI controls voice/settings properly
- [x] **Hold Music System**: R2 storage with coordinated playback
- [x] **WebSocket Authentication**: Solved Workers + OpenAI auth challenge
- [x] **Frontend Integration**: Real-time logs and configuration

### 🚀 **Ready for Production Use**

This implementation is **feature-complete** and **battle-tested**. The core technical challenges (especially WebSocket authentication) have been solved.

## Key Advantages Over Node.js Version

1. **Serverless Scale**: Auto-scales from 0 to thousands of concurrent calls
2. **Global Edge**: Sub-100ms latency worldwide via Cloudflare's network
3. **Cost Efficient**: Pay-per-use instead of running 24/7 servers
4. **WebSocket Innovation**: Solved authentication challenges unique to Workers
5. **Persistent State**: Durable Objects provide reliable session management
6. **R2 Integration**: Distributed hold music with automatic failover

## Deployment

1. **First-time setup:**

   ```bash
   wrangler deploy
   ```

2. **Update your Twilio webhook URL to:**

   ```
   https://your-worker.your-subdomain.workers.dev/twiml
   ```

3. **Update your frontend WebSocket connection to:**
   ```
   wss://your-worker.your-subdomain.workers.dev/logs
   ```

## Cost Considerations

- **Durable Objects**: $0.15 per million requests + $12.50 per GB-month of storage
- **Workers**: $0.50 per million requests (after free tier)
- **WebSocket connections**: Included in Workers pricing

For typical usage, this should be significantly cheaper than running a VPS.

## Troubleshooting

### Common Issues

1. **No voice/greeting on calls**:

   - Check that OpenAI WebSocket shows "🟢 OpenAI WebSocket already open!" in logs
   - Verify session.created event triggers session configuration update

2. **Authentication errors (401)**:

   - Ensure OPENAI_API_KEY is set: `wrangler secret put OPENAI_API_KEY`
   - Check that fetch() includes proper Authorization header

3. **Configuration not applied**:

   - Frontend config must be saved BEFORE making calls
   - Session update happens after session.created event from OpenAI

4. **WebSocket state issues**:
   - Workers WebSockets from fetch() are often already open
   - Don't rely solely on 'open' event listeners

### Debugging

View live logs with emoji indicators:

```bash
wrangler tail
```

Look for these emoji logs:

- 🚀 WebSocket connection starting
- 🟢 WebSocket connected successfully
- 🤖 Messages from OpenAI
- 🎯 session.created event received
- 🔧 Configuration being applied

### Testing

Test the endpoints:

```bash
# Test public URL
curl https://your-worker.your-subdomain.workers.dev/public-url

# Test tools endpoint
curl https://your-worker.your-subdomain.workers.dev/tools
```

## License

Same as the original project (ISC)
