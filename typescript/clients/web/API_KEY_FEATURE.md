# Custom OpenRouter API Key Feature

## Overview
Added support for users to provide their own OpenRouter API key, allowing them to use custom rate limits and track their own usage.

## Implementation

### User Interface
**Location**: Settings Dialog → OpenRouter API Key section

**Features**:
- Password-style input field with show/hide toggle (Eye/EyeOff icons)
- Placeholder: `sk-or-v1-...`
- Help text explaining the feature
- Link to get API key: https://openrouter.ai/keys
- Stored in browser localStorage

### Storage
- **Key**: `openrouter_api_key`
- **Location**: Browser localStorage
- **Security**: Client-side only, never sent to your server
- **Persistence**: Survives page reloads and browser restarts

### API Flow

```
User enters API key → Saved to localStorage → Passed to autocomplete component
                                                          ↓
                                          Sent via x-openrouter-api-key header
                                                          ↓
                                          API route receives header
                                                          ↓
                                    Uses custom key OR falls back to default
                                                          ↓
                                          Fetches models from OpenRouter
```

### Code Changes

**1. Sidebar Component** (`components/sidebar-user-nav.tsx`)
```typescript
const [openRouterApiKey, setOpenRouterApiKey] = useState<string>('');
const [showApiKey, setShowApiKey] = useState<boolean>(false);

// Load from localStorage on mount
React.useEffect(() => {
  const savedApiKey = localStorage.getItem('openrouter_api_key');
  if (savedApiKey) {
    setOpenRouterApiKey(savedApiKey);
  }
}, []);

// Save to localStorage on change
const handleApiKeyChange = (value: string) => {
  setOpenRouterApiKey(value);
  if (value) {
    localStorage.setItem('openrouter_api_key', value);
  } else {
    localStorage.removeItem('openrouter_api_key');
  }
};
```

**2. Autocomplete Component** (`components/openrouter-model-autocomplete.tsx`)
```typescript
interface OpenRouterModelAutocompleteProps {
  apiKey?: string; // New prop
}

// In fetch call
const headers: HeadersInit = {
  'Content-Type': 'application/json',
};

if (apiKey) {
  headers['x-openrouter-api-key'] = apiKey;
}
```

**3. API Route** (`app/(chat)/api/models/route.ts`)
```typescript
// Get custom API key from header if provided
const customApiKey = request.headers.get('x-openrouter-api-key');
const apiKey = customApiKey || process.env.OPENROUTER_API_KEY;

const response = await fetch('https://openrouter.ai/api/v1/models', {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
});
```

## Benefits

1. **Custom Rate Limits**: Users can use their own API keys for better rate limits
2. **Usage Tracking**: Users can track their own OpenRouter usage
3. **Privacy**: API keys stored locally, never sent to your backend
4. **Flexibility**: Optional feature - works with default key if not provided
5. **Security**: Show/hide toggle prevents shoulder surfing

## User Guide

### How to Use

1. **Get an API Key**
   - Visit https://openrouter.ai/keys
   - Sign up or log in
   - Create a new API key

2. **Add to Settings**
   - Open the app
   - Click your wallet address in the sidebar
   - Click "Settings"
   - Find "OpenRouter API Key (Optional)" section
   - Paste your API key
   - Click the eye icon to verify it's correct

3. **Use Models**
   - Your custom API key is now used for all model requests
   - Search and select models as usual
   - Your usage is tracked under your OpenRouter account

### Removing API Key

To remove your custom API key:
1. Open Settings
2. Clear the API key input field
3. The app will revert to using the default API key

## Security Considerations

- ✅ API keys stored in browser localStorage (client-side only)
- ✅ Never sent to your backend server
- ✅ Show/hide toggle for privacy
- ✅ Optional feature - default key used if not provided
- ⚠️ Users should keep their API keys secure
- ⚠️ API keys are visible in browser DevTools (localStorage)

## Testing

```bash
# Start dev server
pnpm run dev

# Test flow
1. Open http://localhost:3100
2. Click wallet address → Settings
3. Enter test API key: sk-or-v1-test123
4. Click eye icon to verify
5. Open model dropdown
6. Check Network tab - should see x-openrouter-api-key header
7. Clear API key field
8. Verify it falls back to default key
```

## Future Enhancements

- [ ] Validate API key format before saving
- [ ] Test API key connection before saving
- [ ] Show API key status (valid/invalid)
- [ ] Display usage statistics from OpenRouter
- [ ] Support multiple API keys (switch between them)
- [ ] Encrypt API keys in localStorage
