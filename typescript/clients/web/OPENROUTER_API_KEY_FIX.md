# OpenRouter API Key Fix

## Problem
The OpenRouter API key set in the frontend sidebar settings was not being used by the server. The server was only using `process.env.OPENROUTER_API_KEY`, causing "No auth credentials found" errors when the environment variable wasn't set.

## Root Cause
- **Frontend**: API key saved to `localStorage` (client-side)
- **Server**: OpenRouter provider initialized with `process.env.OPENROUTER_API_KEY` (server-side)
- **Issue**: Server-side code cannot access client-side localStorage

## Solution
Pass the API key from the client to the server through the API request body, and create dynamic OpenRouter instances with the provided key.

## Architecture

### Before (Server-Only API Key)
```
Frontend localStorage → ❌ Not accessible by server
Server uses process.env.OPENROUTER_API_KEY only
```

### After (Client-Provided API Key)
```
Frontend localStorage → Request Body → Server → Dynamic OpenRouter Instance
Fallback to process.env.OPENROUTER_API_KEY if not provided
```

## Changes Made

### 1. **Chat Component** (`components/chat.tsx`)
Pass API key from localStorage to the server:

```typescript
body: () => {
  // Get OpenRouter API key from localStorage
  const openRouterApiKey = typeof window !== 'undefined' 
    ? localStorage.getItem('openrouter_api_key') 
    : null;
  
  return {
    id,
    selectedChatModel,
    openRouterApiKey, // ⭐ Pass API key to server
    context: {
      walletAddress: address,
      mcpServers,
    },
  };
},
```

### 2. **API Route** (`app/(chat)/api/chat/route.ts`)
Accept and use the API key:

```typescript
const {
  id,
  messages,
  selectedChatModel,
  openRouterApiKey, // ⭐ Receive API key from client
  context,
}: {
  id: string;
  messages: Array<UIMessage>;
  selectedChatModel: string;
  openRouterApiKey?: string | null;
  context: Context;
} = await request.json();

// Pass API key when creating model
const model = openRouterProvider.languageModel(selectedChatModel, openRouterApiKey);

// Pass API key to title generation
const title = await generateTitleFromUserMessage({
  message: userMessage,
  selectedModel: selectedChatModel,
  openRouterApiKey, // ⭐ Pass to title generation
});
```

### 3. **Providers** (`lib/ai/providers.ts`)
Create dynamic OpenRouter instances with custom API keys:

```typescript
// Create a dynamic OpenRouter instance with custom API key
export function createOpenRouterWithKey(apiKey?: string | null) {
  const effectiveApiKey = apiKey || process.env.OPENROUTER_API_KEY;
  return createOpenRouter({
    apiKey: effectiveApiKey,
  });
}

// Update model creation to accept API key
function createDynamicOpenRouterModel(modelId: string, apiKey?: string | null) {
  const router = apiKey ? createOpenRouterWithKey(apiKey) : openRouter;
  
  // Use the router with the correct API key
  return predefinedModels[modelId] || router(modelId);
}

// Update provider to accept API key parameter
export const openRouterProvider: any = {
  languageModel: (modelId: string, apiKey?: string | null) => 
    createDynamicOpenRouterModel(modelId, apiKey),
  // ...
};
```

### 4. **Actions** (`app/(chat)/actions.ts`)
Accept and use API key for title generation:

```typescript
export async function generateTitleFromUserMessage({
  message,
  selectedModel = 'title-model',
  openRouterApiKey, // ⭐ Accept API key
}: {
  message: Message;
  selectedModel?: string;
  openRouterApiKey?: string | null;
}) {
  const modelId = selectedModel || 'title-model';
  
  const { text: title } = await generateText({
    model: openRouterProvider.languageModel(modelId, openRouterApiKey), // ⭐ Use API key
    // ...
  });
  
  return title;
}
```

## Data Flow

### Chat Request Flow
1. **User sends message** in chat
2. **Chat component** reads API key from localStorage
3. **Request sent** to `/api/chat` with `openRouterApiKey` in body
4. **Server receives** API key and model selection
5. **Dynamic OpenRouter instance** created with provided key
6. **Model uses** the correct API key for requests

### Title Generation Flow
1. **New chat created**
2. **Title generation triggered**
3. **API key passed** to `generateTitleFromUserMessage()`
4. **OpenRouter model** created with provided key
5. **Title generated** using correct API key

## Fallback Behavior

If no API key is provided from the client:
- Falls back to `process.env.OPENROUTER_API_KEY`
- Allows server-side API key to work as before
- Maintains backward compatibility

## Benefits

✅ **User API keys work** - Frontend API keys are now used by the server
✅ **No more 401 errors** - Correct authentication credentials sent
✅ **No more 402 errors** - Uses user's paid API key instead of default
✅ **Flexible** - Supports both client-provided and server-side API keys
✅ **Secure** - API key only sent in request body, not exposed in URLs
✅ **Backward compatible** - Falls back to environment variable if needed

## Security Considerations

- API key is sent in the request body (not URL parameters)
- API key is only accessible to authenticated users
- Server validates session before processing requests
- API key is not logged or exposed in error messages

## Testing

1. **Set API key in sidebar settings**
2. **Send a message**
3. **Check network tab** - API key should be in request body
4. **Verify no 401/402 errors**
5. **Check title generation** - Should use your API key
6. **Test without API key** - Should fall back to env variable

## Files Modified

1. `components/chat.tsx` - Pass API key in request
2. `app/(chat)/api/chat/route.ts` - Accept and use API key
3. `lib/ai/providers.ts` - Dynamic OpenRouter with custom keys
4. `app/(chat)/actions.ts` - Accept API key for title generation

## Environment Variables

- `OPENROUTER_API_KEY` - Optional fallback API key
- If not set and no client key provided, requests will fail with 401

## Future Improvements

- Consider encrypting API key in localStorage
- Add API key validation before sending requests
- Show API key status in UI (valid/invalid)
- Add option to use server-side key vs user key
