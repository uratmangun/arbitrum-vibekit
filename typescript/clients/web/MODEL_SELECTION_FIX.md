# Model Selection Fix

## Problem
The `selectedChatModel` was always sending `"chat-model"` to the API instead of the actual selected model from the settings modal.

## Root Cause
The `Chat` component received `selectedChatModel` as a **static prop** from the page component. When users changed the model in the settings modal:
1. The model selector saved the new model to a cookie
2. The cookie was updated successfully
3. **BUT** the `Chat` component's prop didn't update because it was set once on page load

## Solution
Made the `Chat` component **reactive** to model selection changes:

### Changes Made

#### 1. `components/chat.tsx`
- Changed `selectedChatModel` prop to `initialChatModel` to clarify it's only used for initialization
- Added state: `const [selectedChatModel, setSelectedChatModel] = useState(initialChatModel)`
- Added `useEffect` to listen for model changes via:
  - Custom event: `'chat-model-updated'`
  - Cookie polling (fallback): Checks cookie every 1 second
- When model changes, updates the state which triggers the `useChat` hook to use the new model

#### 2. `components/model-selector.tsx`
- Modified the `onSelect` handler to dispatch a custom event after saving the cookie
- Dispatches: `window.dispatchEvent(new CustomEvent('chat-model-updated', { detail: { modelId: id } }))`
- This immediately notifies the Chat component of the change

## How It Works Now

1. **User selects a model** in the settings modal
2. **Model selector** calls `saveChatModelAsCookie(id)`
3. **Cookie is saved** on the server
4. **Custom event is dispatched**: `'chat-model-updated'`
5. **Chat component** receives the event
6. **Chat component** reads the cookie and updates its state
7. **Next API call** uses the correct `selectedChatModel`

## Benefits

✅ **Immediate updates**: Model changes take effect immediately without page refresh
✅ **No page reload needed**: Works seamlessly in SPA navigation
✅ **Fallback mechanism**: Cookie polling ensures it works even if events fail
✅ **Consistent with MCP servers**: Uses the same pattern as MCP server updates

## Testing

1. Open the app
2. Open settings modal
3. Change the model (e.g., from "Z.AI: GLM 4.5 Air" to another model)
4. Close the modal
5. Send a message
6. Check the network tab - the payload should now include the correct `selectedChatModel`

## Additional Fix: Title Generation

### Problem
The `generateTitleFromUserMessage` function was hardcoded to use `'title-model'` (google/gemini-2.5-flash) instead of respecting the user's selected model.

### Solution
Modified `app/(chat)/actions.ts` to:
1. Read the selected model from the `'chat-model'` cookie
2. Use that model for title generation
3. Fallback to `'title-model'` only if no model is selected

```typescript
const cookieStore = await cookies();
const selectedModelCookie = cookieStore.get('chat-model');
const modelId = selectedModelCookie?.value || 'title-model';
```

Now title generation uses the same model as the chat!

## Files Modified

- `components/chat.tsx` - Made model selection reactive
- `components/model-selector.tsx` - Added event dispatch on model change
- `app/(chat)/actions.ts` - Fixed title generation to use selected model
- `package.json` - Updated AI SDK to v5.0.79

## Related Issues

This fix also prepares the codebase for the tool approval feature by ensuring the correct model is always used.
