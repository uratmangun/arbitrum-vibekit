#!/usr/bin/env bash
set -e

echo "🚀 Pushing environment variables to Vercel..."

# Read from .env.local and push to Vercel
# Critical environment variables for production

# POSTGRES_URL
echo "Adding POSTGRES_URL..."
echo "$POSTGRES_URL" | vercel env add POSTGRES_URL production

# AUTH_SECRET
echo "Adding AUTH_SECRET..."
echo "$AUTH_SECRET" | vercel env add AUTH_SECRET production

# NEXT_PUBLIC_PARA_API_KEY
echo "Adding NEXT_PUBLIC_PARA_API_KEY..."
echo "$NEXT_PUBLIC_PARA_API_KEY" | vercel env add NEXT_PUBLIC_PARA_API_KEY production

# DEFAULT_PROVIDER_TYPE
echo "Adding DEFAULT_PROVIDER_TYPE..."
echo "$DEFAULT_PROVIDER_TYPE" | vercel env add DEFAULT_PROVIDER_TYPE production

# DEFAULT_MODEL
echo "Adding DEFAULT_MODEL..."
echo "$DEFAULT_MODEL" | vercel env add DEFAULT_MODEL production

# DEFAULT_API_BASE_URL
echo "Adding DEFAULT_API_BASE_URL..."
echo "$DEFAULT_API_BASE_URL" | vercel env add DEFAULT_API_BASE_URL production

# DEFAULT_API_KEY
echo "Adding DEFAULT_API_KEY..."
echo "$DEFAULT_API_KEY" | vercel env add DEFAULT_API_KEY production

# EMBER_ENDPOINT
echo "Adding EMBER_ENDPOINT..."
echo "$EMBER_ENDPOINT" | vercel env add EMBER_ENDPOINT production

# RPC_URL
echo "Adding RPC_URL..."
echo "$RPC_URL" | vercel env add RPC_URL production

echo "✅ Environment variables pushed successfully!"
echo "🔄 Trigger a new deployment with: vercel --prod"
