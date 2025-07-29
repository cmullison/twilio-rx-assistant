# Frontend Migration to Cloudflare Workers (OpenNext)

This guide explains how to deploy your Next.js frontend to Cloudflare Workers using OpenNext.

## ✅ What's Been Migrated

- **Framework**: Next.js 14.2.5 → **Cloudflare Workers (OpenNext)**
- **Backend URLs**: Hardcoded localhost → **Dynamic configuration**
- **Deployment**: Manual hosting → **Automated Cloudflare Pages/Workers**
- **Build System**: Standard Next.js → **OpenNext for Workers compatibility**

## 🚀 Quick Deploy

```bash
cd webapp

# Set your actual Workers backend URL
export NEXT_PUBLIC_BACKEND_URL=https://your-backend-worker.your-subdomain.workers.dev

# Deploy
npm run deploy
```

## 📋 Detailed Setup

### 1. Environment Configuration

#### For Development (Local)

```bash
# .env.local
NEXT_PUBLIC_BACKEND_URL=http://localhost:8787
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
```

#### For Production (Workers)

Set environment variables in Cloudflare:

```bash
# Set production backend URL
wrangler secret put NEXT_PUBLIC_BACKEND_URL
# Enter: https://your-backend-worker.your-subdomain.workers.dev

# Set Twilio credentials
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
```

### 2. Available Scripts

- `npm run dev` - Local development server
- `npm run build` - Build Next.js app
- `npm run preview` - Preview on local Workers runtime
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run cf-typegen` - Generate Cloudflare types

### 3. Backend Connection

The frontend now automatically connects to:

**Development:**

- WebSocket: `ws://localhost:8787/logs`
- HTTP APIs: `http://localhost:8787/tools`, `/public-url`, etc.

**Production:**

- WebSocket: `wss://your-backend-worker.workers.dev/logs`
- HTTP APIs: `https://your-backend-worker.workers.dev/tools`, etc.

### 4. Updated Components

The following components were updated to use dynamic backend URLs:

- `components/call-interface.tsx` - WebSocket connection
- `components/session-configuration-panel.tsx` - Tools API
- `components/checklist-and-config.tsx` - Backend health checks
- `lib/config.ts` - **New:** Backend URL configuration

## 🔧 Configuration Files

### wrangler.jsonc

```json
{
  "name": "twilio-realtime-frontend",
  "main": ".open-next/worker.js",
  "compatibility_date": "2024-12-30",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "vars": {
    "BACKEND_URL": "https://your-backend-worker.workers.dev"
  }
}
```

### open-next.config.ts

```typescript
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // OpenNext configuration
});
```

## 🌐 Domain Setup

### Option 1: Cloudflare Pages (Recommended)

1. **Connect Repository:**

   ```bash
   # Go to Cloudflare Dashboard → Pages → Connect to Git
   # Select your repository and webapp folder
   ```

2. **Build Configuration:**

   - Build command: `npm run build`
   - Build output directory: `.open-next`
   - Root directory: `webapp`

3. **Environment Variables:**
   Set in Pages dashboard:
   - `NEXT_PUBLIC_BACKEND_URL`: Your backend worker URL
   - `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
   - `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token

### Option 2: Workers Direct Deploy

```bash
# Deploy directly via Wrangler
npm run deploy

# Your frontend will be available at:
# https://twilio-realtime-frontend.your-subdomain.workers.dev
```

## 🔄 Development Workflow

### Local Development

1. **Start Backend Worker:**

   ```bash
   cd ../do-server
   npm run dev
   # Backend runs on http://localhost:8787
   ```

2. **Start Frontend:**

   ```bash
   cd webapp
   npm run dev
   # Frontend runs on http://localhost:3000
   ```

3. **Test Integration:**
   - Frontend automatically connects to backend on `:8787`
   - WebSocket logs appear in browser console
   - Function calls and hold music work locally

### Production Testing

```bash
# Test production build locally
npm run preview

# Runs frontend on Workers runtime locally
# Uses production backend URL from environment
```

## 📊 Performance Benefits

### Before (Traditional Hosting)

- Server costs for hosting
- Manual SSL/CDN setup
- Regional latency
- Manual scaling

### After (Cloudflare Workers)

- **Global Edge Network**: Sub-100ms response times worldwide
- **Auto-scaling**: Handles traffic spikes automatically
- **Zero Cold Starts**: Workers stay warm
- **Integrated CDN**: Static assets cached globally
- **Cost Efficient**: Pay only for requests

## 🛠 Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**

   ```bash
   # Check backend URL in browser console
   console.log(BACKEND_WS_URL);

   # Should be: wss://your-backend-worker.workers.dev
   ```

2. **API Routes Return 500**

   - Check Twilio credentials are properly set
   - Verify TWILIO_ACCOUNT_SID starts with "AC"
   - Verify TWILIO_AUTH_TOKEN starts with "SK"

3. **Build Fails**

   ```bash
   # Clear Next.js cache
   rm -rf .next .open-next
   npm run build
   ```

4. **Environment Variables Not Working**

   ```bash
   # Verify environment variables
   wrangler secret list

   # Check .env.local for development
   cat .env.local
   ```

### Debug Commands

```bash
# Check Cloudflare environment
wrangler whoami

# View live logs
wrangler tail twilio-realtime-frontend

# Test backend connectivity
curl https://your-backend-worker.workers.dev/public-url

# Test frontend build
npm run preview
```

## 🔗 Integration with Backend

Your frontend now works seamlessly with the Workers backend:

### WebSocket Connection

- **Frontend**: `wss://frontend.workers.dev`
- **Backend**: `wss://backend.workers.dev`
- **Connection**: Frontend → Backend `/logs` endpoint

### API Integration

- **Tools**: `GET /tools` - Function schemas
- **Status**: `GET /public-url` - Backend health
- **Hold Music**: `GET /hold-music/files` - Available audio files

### Function Calling

- Frontend sends session config via WebSocket
- Backend executes functions (weather, prescriptions)
- Hold music plays automatically during function calls
- Results streamed back via WebSocket

## 📈 Next Steps

1. **Custom Domain**: Add your domain in Cloudflare Pages
2. **Analytics**: Enable Cloudflare Analytics for insights
3. **Monitoring**: Set up alerts for errors/performance
4. **Optimization**: Enable additional Cloudflare features (Image Optimization, etc.)

Your frontend is now production-ready on Cloudflare Workers! 🎉
