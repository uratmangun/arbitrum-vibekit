#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read .env.local file
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

// Parse environment variables
const envVars = {};
envContent.split('\n').forEach(line => {
  line = line.trim();
  // Skip comments and empty lines
  if (!line || line.startsWith('#')) return;
  
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) {
    const [, key, value] = match;
    // Remove quotes if present
    envVars[key] = value.replace(/^["']|["']$/g, '');
  }
});

// Critical environment variables for production
const criticalVars = [
  'POSTGRES_URL',
  'AUTH_SECRET',
  'NEXT_PUBLIC_PARA_API_KEY',
  'DEFAULT_PROVIDER_TYPE',
  'DEFAULT_MODEL',
  'DEFAULT_API_BASE_URL',
  'DEFAULT_API_KEY',
  'EMBER_ENDPOINT',
  'RPC_URL'
];

console.log('🚀 Syncing environment variables to Vercel...\n');

criticalVars.forEach(key => {
  if (envVars[key]) {
    console.log(`Adding ${key}...`);
    try {
      execSync(`echo "${envVars[key]}" | vercel env add ${key} production`, {
        stdio: 'inherit',
        cwd: __dirname
      });
      console.log(`✅ ${key} added\n`);
    } catch (error) {
      console.error(`❌ Failed to add ${key}: ${error.message}\n`);
    }
  } else {
    console.log(`⚠️  ${key} not found in .env.local\n`);
  }
});

console.log('\n✅ Environment variables sync complete!');
console.log('🔄 Trigger a new deployment with: vercel --prod');
