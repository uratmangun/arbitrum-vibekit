# Vercel Environment Variables Setup

## Issue Found

The Vercel deployment is failing because **no environment variables are configured** in the Vercel project.

## Fixes Applied

1. ✅ **Removed error suppression flags** from `vercel.json`:
   - Removed `NEXT_IGNORE_BUILD_ERRORS: "true"`
   - Removed `NEXT_IGNORE_ESLint_ERRORS: "true"`
   - This will now show actual build errors instead of hiding them

2. ✅ **Fixed `.env.local` syntax error**:
   - Fixed line 18: `DEFAULT_SYSTEM_PROMPT="You're an AI assistant"` (added quotes)

## Required Environment Variables

Add these environment variables to your Vercel project (Production environment):

### Critical Variables (Required for Build)

1. **POSTGRES_URL**
   ```
   postgresql://neondb_owner:npg_D4juAk9ildeN@ep-old-queen-ah58dtwx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

2. **AUTH_SECRET**
   ```
   your-super-secret-key-change-this-in-production
   ```

3. **NEXT_PUBLIC_PARA_API_KEY**
   ```
   beta_1f5791df339749e06edabd38e2af1c02
   ```

4. **DEFAULT_PROVIDER_TYPE**
   ```
   openai-compatible
   ```

5. **DEFAULT_MODEL**
   ```
   big-pickle
   ```

6. **DEFAULT_API_BASE_URL**
   ```
   https://opencode.ai/zen/v1
   ```

7. **DEFAULT_API_KEY**
   ```
   sk-9yz1kdABzGHpsqad82JtZxHBdXIHJ4IlFngcS8P7F5WTe5cKn6rYlDUDXtLigu9Q
   ```

8. **EMBER_ENDPOINT**
   ```
   https://api.emberai.xyz/mcp
   ```

9. **RPC_URL**
   ```
   https://arbitrum.llamarpc.com
   ```

## How to Add Environment Variables

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to https://vercel.com/koisose0-8194s-projects/arbitrum-vibekit
2. Click on **Settings** tab
3. Click on **Environment Variables** in the left sidebar
4. For each variable above:
   - Click **Add New**
   - Enter the **Key** (e.g., `POSTGRES_URL`)
   - Enter the **Value** (copy from above)
   - Select **Production** environment
   - Click **Save**

### Option 2: Via Vercel CLI (Interactive)

Run these commands one by one (you'll be prompted for the value):

```bash
vercel env add POSTGRES_URL production
vercel env add AUTH_SECRET production
vercel env add NEXT_PUBLIC_PARA_API_KEY production
vercel env add DEFAULT_PROVIDER_TYPE production
vercel env add DEFAULT_MODEL production
vercel env add DEFAULT_API_BASE_URL production
vercel env add DEFAULT_API_KEY production
vercel env add EMBER_ENDPOINT production
vercel env add RPC_URL production
```

## After Adding Environment Variables

1. Trigger a new deployment:
   ```bash
   vercel --prod
   ```

2. Or push a commit to trigger automatic deployment:
   ```bash
   git add vercel.json
   git commit -m "fix(vercel): remove build error suppression flags"
   git push
   ```

## Verification

After deployment, check:
- Build logs should show no errors
- Deployment status should be "Ready" (green checkmark)
- Visit the deployment URL to verify the app works

## Notes

- The local build works fine (`pnpm build` succeeds)
- The issue is purely due to missing environment variables in Vercel
- Once environment variables are added, the deployment should succeed
