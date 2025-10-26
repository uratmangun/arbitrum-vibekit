# OpenRouter Dynamic Model Selection with Autocomplete

This feature provides an autocomplete dropdown that allows users to search and select from all available OpenRouter models dynamically through the UI, with real-time filtering capabilities.

## Features

- **Autocomplete Dropdown**: Custom-built autocomplete component with search functionality
- **Dynamic Model Fetching**: Fetches all available models from OpenRouter API
- **Real-time Search & Filter**: Instant filtering of models by name, ID, or description
- **Custom API Key Support**: Users can provide their own OpenRouter API key for custom rate limits
- **Secure Key Storage**: API keys stored in browser localStorage with show/hide toggle
- **Debounced Search**: 300ms debounce to optimize API calls and reduce server load
- **Rich Display**: Shows model names and descriptions in the dropdown
- **Click-outside Handling**: Automatically closes dropdown when clicking outside
- **Loading States**: Visual feedback during model fetching
- **Caching**: API responses are cached for 1 hour to reduce load

## Implementation Details

### Files Created/Modified

1. **`lib/ai/openrouter-types.ts`** (New)
   - TypeScript interfaces for OpenRouter API responses
   - Defines `OpenRouterModel` and `OpenRouterModelsResponse` types

2. **`app/(chat)/api/models/route.ts`** (New)
   - API endpoint that fetches models from OpenRouter
   - Supports query parameters:
     - `search`: Filter models by name/ID/description
     - `limit`: Maximum number of results (default: 100)
   - Returns filtered model list with metadata

3. **`components/ui/autocomplete.tsx`** (New)
   - Reusable autocomplete component
   - Features:
     - Search input with real-time filtering
     - Scrollable dropdown (max 300px height)
     - Loading and empty states
     - Click-outside to close
     - Keyboard accessible
     - Displays option labels and descriptions

4. **`components/openrouter-model-autocomplete.tsx`** (New)
   - Wrapper component specifically for OpenRouter models
   - Fetches models from API with debouncing
   - Formats model data for autocomplete display
   - Handles loading and error states

5. **`components/sidebar-user-nav.tsx`** (Modified)
   - Replaced hardcoded `<select>` with `OpenRouterModelAutocomplete`
   - Added optional API key input field with show/hide toggle
   - Manages selected model state and API key in localStorage
   - Integrated into settings dialog

6. **`components/model-selector.tsx`** (Modified)
   - Enhanced with search input field
   - Fetches models dynamically from API
   - Displays loading and error states
   - Merges local and OpenRouter models
   - Improved UI with scrollable dropdown (max-height: 500px)

7. **`lib/ai/providers.ts`** (Modified)
   - Updated to support dynamic model IDs
   - `createDynamicOpenRouterModel()` function handles any OpenRouter model ID
   - Maintains backward compatibility with predefined models

## Usage

### User Experience

**In Settings Dialog (Sidebar):**
1. Click on your wallet address in the sidebar
2. Click "Settings" from the dropdown menu
3. **(Optional)** In the "OpenRouter API Key" section, enter your own API key
   - Click the eye icon to show/hide your API key
   - Your key is stored securely in browser localStorage
   - Leave empty to use the default API key
4. In the "AI Model" section, click the autocomplete dropdown
5. Type to search and filter from 400+ OpenRouter models in real-time
6. Click on a model to select it
7. The dropdown closes automatically and your selection is saved

**In Chat Interface:**
1. Use the model selector in the chat header
2. Search and select models dynamically
3. Changes apply immediately to new conversations

### API Endpoint

```bash
GET /api/models?search=gpt&limit=50
```

Response:
```json
{
  "data": [
    {
      "id": "openai/gpt-4o",
      "name": "GPT-4o",
      "description": "Most advanced GPT-4 model...",
      "context_length": 128000,
      "pricing": {
        "prompt": "0.000005",
        "completion": "0.000015"
      },
      ...
    }
  ],
  "total": 400,
  "filtered": 50
}
```

## Configuration

### Environment Variables

Ensure `OPENROUTER_API_KEY` is set in your `.env` file as the default/fallback key:

```env
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
```

### Custom API Keys

Users can provide their own OpenRouter API key through the Settings dialog:
- Keys are stored in browser `localStorage` under the key `openrouter_api_key`
- Custom keys are sent via the `x-openrouter-api-key` header to the API
- If no custom key is provided, the default `OPENROUTER_API_KEY` is used
- Users can get their API key at https://openrouter.ai/keys

### Caching

The API route uses Next.js caching with a 1-hour revalidation period:

```typescript
export const revalidate = 3600; // Cache for 1 hour
```

## Benefits

1. **Always Up-to-Date**: Users have access to the latest models without code changes
2. **Better Discovery**: Users can search and discover models that fit their needs
3. **Flexibility**: Any OpenRouter model can be selected and used immediately
4. **Performance**: Debouncing and caching optimize API usage
5. **Resilience**: Fallback to local models ensures the app works even if API fails

## Future Enhancements

- Add model filtering by capabilities (tools, reasoning, etc.)
- Display pricing information in the dropdown
- Add favorites/recent models
- Group models by provider or category
- Add model comparison feature
