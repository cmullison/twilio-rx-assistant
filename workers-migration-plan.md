# Cloudflare Workers Migration Plan

## Twilio + OpenAI Realtime API Project

### 🎯 Migration Goal

Convert the current Express + Next.js architecture to Cloudflare Workers + Vite/React for simplified deployment and better scalability.

---

## 📋 Current Architecture

```
Twilio Phone Call → Express WebSocket Server (localhost:8081) → OpenAI Realtime API
                           ↓
                    Next.js Frontend (localhost:3000)
                           ↓
                    API Routes (/api/twilio/*)
```

## 🚀 Target Architecture

```
Twilio Phone Call → Cloudflare Worker (WebSocket) → OpenAI Realtime API
                           ↓
                    Vite/React Frontend (Cloudflare Pages)
                           ↓
                    Worker API Endpoints
```

---

## ⚡ Benefits of Migration

- ✅ **No ngrok needed** - Workers provide public URLs automatically
- ✅ **Global deployment** - Low latency worldwide
- ✅ **Simpler deployment** - Single platform (Cloudflare)
- ✅ **Better scalability** - Automatic scaling
- ✅ **Cost effective** - Pay per use model
- ✅ **Built-in HTTPS** - Secure by default

---

## 📁 New Project Structure

```
cloudflare-realtime-project/
├── workers-backend/
│   ├── src/
│   │   ├── index.ts              # Main Workers entry point
│   │   ├── websocket-handler.ts  # WebSocket connection handling
│   │   ├── session-manager.ts    # Adapted from current sessionManager.ts
│   │   ├── function-handlers.ts  # Copy from current functionHandlers.ts
│   │   ├── twilio-api.ts         # Twilio API endpoints
│   │   └── types.ts              # Copy from current types.ts
│   ├── wrangler.toml
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/            # Copy from webapp/components/
    │   ├── lib/                   # Copy from webapp/lib/
    │   ├── App.tsx               # Convert from webapp/app/page.tsx
    │   └── main.tsx              # Vite entry point
    ├── index.html
    ├── vite.config.ts
    └── package.json
```

---

# 🛠️ Migration Steps

## Phase 1: Backend Migration (Workers)

### Step 1.1: Create Workers Project

```bash
# Create new Workers project
npm create cloudflare@latest workers-backend
cd workers-backend

# Install additional dependencies
npm install ws @types/ws
```

### Step 1.2: Setup wrangler.toml

```toml
name = "twilio-openai-realtime"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
PUBLIC_URL = "https://twilio-openai-realtime.your-subdomain.workers.dev"

[env.production.vars]
PUBLIC_URL = "https://twilio-openai-realtime.your-subdomain.workers.dev"
```

### Step 1.3: Create Main Entry Point (src/index.ts)

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Route handling
    if (url.pathname === "/twiml") {
      return handleTwiML(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return handleAPIRoutes(request, env);
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return handleWebSocket(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

### Step 1.4: Convert WebSocket Handling (src/websocket-handler.ts)

```typescript
// Adapt your current sessionManager.ts logic to Workers WebSocket API
// Key changes:
// - Replace 'ws' library with Workers WebSocket
// - Use WebSocketPair instead of WebSocketServer
// - Adapt event handlers to Workers format
```

### Step 1.5: Move API Routes (src/twilio-api.ts)

Convert these Next.js API routes to Workers:

- `/api/twilio` → Check credentials
- `/api/twilio/numbers` → List/update phone numbers
- `/api/twilio/webhook-local` → Return webhook URL

### Step 1.6: Copy Existing Logic

- Copy `functionHandlers.ts` as-is
- Copy `types.ts` as-is
- Adapt `sessionManager.ts` for Workers WebSocket API

### Step 1.7: Set Environment Variables

```bash
# Set secrets
wrangler secret put OPENAI_API_KEY
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN

# Test locally
npm run dev
```

---

## Phase 2: Frontend Migration (Vite/React)

### Step 2.1: Create Vite Project

```bash
# Create new Vite project
npm create vite@latest frontend -- --template react-ts
cd frontend

# Install UI dependencies
npm install lucide-react class-variance-authority clsx tailwind-merge tailwindcss-animate
npm install -D tailwindcss postcss autoprefixer @types/react @types/react-dom
```

### Step 2.2: Setup Tailwind CSS

```bash
npx tailwindcss init -p
```

Configure `tailwind.config.js` to match your current setup.

### Step 2.3: Copy Components and Lib

```bash
# Copy from webapp/
cp -r ../webapp/components ./src/
cp -r ../webapp/lib ./src/
cp ../webapp/app/globals.css ./src/
```

### Step 2.4: Convert App Structure

- Convert `webapp/app/page.tsx` → `src/App.tsx`
- Convert `webapp/app/layout.tsx` → Update `index.html`
- Update component imports to use relative paths

### Step 2.5: Update API Calls

Replace all API calls to point to your Workers backend:

```typescript
// Old: localhost:3000/api/twilio
// New: https://your-worker.workers.dev/api/twilio

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8787";
```

### Step 2.6: Update WebSocket Connections

```typescript
// Old: ws://localhost:8081/logs
// New: wss://your-worker.workers.dev/logs

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8787";
```

---

## Phase 3: Key Code Adaptations

### Step 3.1: WebSocket API Changes

**Current (ws library):**

```typescript
import { WebSocket } from "ws";
ws.on("message", handler);
ws.send(data);
```

**Workers API:**

```typescript
// In Workers
server.addEventListener("message", handler);
server.send(data);

// In frontend (no change needed)
ws.onmessage = handler;
ws.send(data);
```

### Step 3.2: Session Management

Keep similar structure but adapt for Workers:

```typescript
// Global variable still works for WebSocket connections
let session: Session = {};

// Adapt your existing handleCallConnection logic
export function handleTwilioConnection(ws: WebSocket, openAIApiKey: string) {
  // Your existing logic with Workers WebSocket API
}
```

### Step 3.3: Environment Variables

**Current (.env files):**

```
OPENAI_API_KEY=...
TWILIO_ACCOUNT_SID=...
```

**Workers (wrangler secrets):**

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put TWILIO_ACCOUNT_SID
```

**Frontend (.env):**

```
VITE_BACKEND_URL=https://your-worker.workers.dev
VITE_WS_URL=wss://your-worker.workers.dev
```

---

## Phase 4: Deployment

### Step 4.1: Deploy Workers Backend

```bash
cd workers-backend
wrangler deploy
# Note the deployed URL for frontend config
```

### Step 4.2: Deploy Frontend to Cloudflare Pages

```bash
cd frontend

# Build
npm run build

# Deploy to Cloudflare Pages
wrangler pages deploy dist

# Or connect to GitHub for auto-deployment
wrangler pages project create frontend
```

### Step 4.3: Update Twilio Webhook

Update your Twilio phone number webhook URL to:

```
https://your-worker.workers.dev/twiml
```

---

## Phase 5: Testing & Validation

### Step 5.1: Test WebSocket Connections

- [ ] Frontend connects to Workers (`/logs` endpoint)
- [ ] Twilio connects to Workers (`/call` endpoint)
- [ ] Workers connects to OpenAI Realtime API

### Step 5.2: Test Phone Call Flow

- [ ] Make test call to Twilio number
- [ ] Verify TwiML response
- [ ] Confirm audio streaming works
- [ ] Check frontend receives transcript updates

### Step 5.3: Test Function Calling

- [ ] Trigger function calls during conversation
- [ ] Verify function responses work
- [ ] Check frontend function call panel

### Step 5.4: Test Configuration Changes

- [ ] Session configuration updates work
- [ ] Tool configuration saves properly
- [ ] Environment variables load correctly

---

## 🚨 Potential Issues & Solutions

### Issue 1: WebSocket Connection Limits

**Problem:** Workers have connection time limits
**Solution:** Implement reconnection logic in frontend

### Issue 2: CORS Issues

**Problem:** Cross-origin requests blocked
**Solution:** Add proper CORS headers in Workers

### Issue 3: Environment Variable Access

**Problem:** Frontend can't access Worker secrets
**Solution:** Use separate VITE\_ prefixed vars for frontend

### Issue 4: Cold Start Delays

**Problem:** First request after idle time is slower
**Solution:** Implement keep-alive pings or accept slight delay

---

## 🔄 Rollback Plan

If migration fails:

1. Keep original Express + Next.js code intact
2. Deploy to Railway/Render as backup
3. Switch Twilio webhook back to ngrok URL
4. Gradual migration approach - move one component at a time

---

## 📊 Success Metrics

- [ ] Phone calls work end-to-end
- [ ] No ngrok dependency
- [ ] Frontend loads in <2 seconds
- [ ] WebSocket connections stable
- [ ] Function calling works properly
- [ ] All environment configs working
- [ ] Twilio webhook responds correctly

---

## 🔗 Reference Materials

- [Cloudflare Workers WebSocket API](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [Craig's OpenAI + Workers Example](https://github.com/craigsdennis/talk-to-javascript-openai-workers)
- [Cloudflare Pages Deployment](https://developers.cloudflare.com/pages/)
- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [Twilio Media Streams](https://www.twilio.com/docs/voice/media-streams)

---

**Estimated Total Migration Time: 6-8 hours**

- Backend: 3-4 hours
- Frontend: 2-3 hours
- Testing: 1-2 hours
