#!/bin/bash

echo "🚀 Setting up OpenAI Twilio Realtime Worker..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing globally..."
    npm install -g wrangler
fi

# Authenticate with Cloudflare (if not already done)
echo "🔐 Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "Please authenticate with Cloudflare:"
    wrangler auth login
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create R2 bucket for hold music
echo "🎵 Setting up R2 bucket for hold music..."
wrangler r2 bucket create tracks

# Set up OpenAI API key
echo "🔑 Setting up OpenAI API key..."
echo "Please enter your OpenAI API key:"
wrangler secret put OPENAI_API_KEY

# Deploy the worker
echo "🚀 Deploying to Cloudflare..."
npx wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your worker is now live. Make note of the URL provided above."
echo ""
echo "Next steps:"https://openai-twilio-realtime-worker.hall-russets0w.workers.dev
echo "1. Upload hold music files to R2 (see r2-setup.md for details):"
echo "   wrangler r2 object put tracks/hold-music.raw --file=/path/to/your/audio.raw"
echo "2. Update your Twilio webhook URL to: https://openai-twilio-realtime-worker.hall-russets0w.workers.dev/twiml"
echo "3. Update your frontend WebSocket connection to: wss://openai-twilio-realtime-worker.hall-russets0w.workers.dev/logs"
echo ""
echo "Test your deployment:"
echo "curl https://openai-twilio-realtime-worker.hall-russets0w.workers.dev/public-url"
echo "curl https://openai-twilio-realtime-worker.hall-russets0w.workers.dev/tools"
echo "curl https://openai-twilio-realtime-worker.hall-russets0w.workers.dev/hold-music/files" 