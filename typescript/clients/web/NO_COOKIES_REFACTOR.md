# No Cookies Refactor - Model Selection

## Problem
The previous implementation relied on cookies for model selection, which caused timing issues and always fell back to the default model (google/gemini-2.5-flash).

## Solution
Complete refactor to pass the selected model directly through component state and function parameters, eliminating cookie dependency.

## Architecture Changes

### Before (Cookie-Based)
```
ModelSelector → Save to Cookie → Chat reads Cookie → API uses Model
                    ↓ (timing issues)
              Fallback to default model
```

### After (Direct State)
```
ModelSelector → Dispatch Event → Chat Updates State → API uses Model
                                 (immediate & reliable)
```

## Files Modified

### 1. **Page Components** (Removed Cookie Reading)
- `app/(chat)/page.tsx`
- `app/(chat)/chat/[id]/page.tsx`

**Changes:**
- Removed: `import { cookies } from 'next/headers'`
- Removed: Cookie reading logic
- Changed prop: `selectedChatModel` → `initialSelectedChatModel`
- Simplified to always use `DEFAULT_CHAT_MODEL` as initial value

### 2. **Chat Component** (`components/chat.tsx`)
**Changes:**
- Renamed prop: `selectedChatModel` → `initialSelectedChatModel`
- Added state: `const [selectedChatModel, setSelectedChatModel] = useState(initialSelectedChatModel)`
- Removed: Cookie polling logic
- Updated: Event listener now reads from `event.detail.modelId` directly

```typescript
// Listen for model selection changes from model selector
useEffect(() => {
  const handleModelChange = (event: Event) => {
    const customEvent = event as CustomEvent;
    const modelId = customEvent.detail?.modelId;
    if (modelId) {
      console.log('[Chat] Model updated:', modelId);
      setSelectedChatModel(modelId);
    }
  };

  window.addEventListener('chat-model-updated', handleModelChange);
  return () => window.removeEventListener('chat-model-updated', handleModelChange);
}, []);
```

### 3. **Model Selector** (`components/model-selector.tsx`)
**Changes:**
- Removed: `import { saveChatModelAsCookie } from '@/app/(chat)/actions'`
- Removed: `startTransition` wrapper
- Simplified: Direct event dispatch on model selection

```typescript
onSelect={() => {
  setOpen(false);
  setSearchQuery('');
  setOptimisticModelId(id);
  // Dispatch custom event to notify Chat component immediately
  window.dispatchEvent(new CustomEvent('chat-model-updated', { detail: { modelId: id } }));
}}
```

### 4. **Actions** (`app/(chat)/actions.ts`)
**Changes:**
- Removed: `saveChatModelAsCookie()` function
- Removed: `saveChatAgentAsCookie()` function
- Removed: `import { cookies } from 'next/headers'`
- Updated: `generateTitleFromUserMessage()` now accepts `selectedModel` parameter

### 5. **Agent Selectors** (Fixed Import Errors)
- `components/agent-selector.tsx` - Removed cookie import and save call
- `components/ui/agent-chips.tsx` - Removed cookie import and save call

```typescript
export async function generateTitleFromUserMessage({
  message,
  selectedModel = 'title-model',
}: {
  message: Message;
  selectedModel?: string;
}) {
  const modelId = selectedModel || 'title-model';
  // ... rest of function
}
```

### 5. **API Route** (`app/(chat)/api/chat/route.ts`)
**Changes:**
- Updated: Pass `selectedChatModel` to `generateTitleFromUserMessage()`

```typescript
const title = await generateTitleFromUserMessage({
  message: userMessage,
  selectedModel: selectedChatModel,
});
```

## Benefits

✅ **No Timing Issues** - Model selection is immediate and reliable
✅ **No Cookie Dependency** - Eliminates cookie-related bugs
✅ **Direct Data Flow** - Model flows directly from selector to API
✅ **Type-Safe** - All model selections are passed as parameters
✅ **Faster** - No cookie polling or reading overhead
✅ **Cleaner Code** - Removed cookie-related logic

## Data Flow

1. **User selects model** in ModelSelector dropdown
2. **Event dispatched**: `window.dispatchEvent(new CustomEvent('chat-model-updated', { detail: { modelId } }))`
3. **Chat component** receives event and updates state: `setSelectedChatModel(modelId)`
4. **Next API call** includes the updated `selectedChatModel` in the request body
5. **Title generation** receives `selectedChatModel` as parameter
6. **Both chat and title** use the correct selected model

## Testing

1. Open the app
2. Select a different model from the dropdown
3. Send a message
4. Check network tab - payload includes correct `selectedChatModel`
5. Chat title should be generated using the selected model
6. No more fallback to google/gemini-2.5-flash

## Migration Notes

- No database changes required
- No environment variable changes required
- Backward compatible with existing chats
- No breaking changes to API contracts

## Future Improvements

- Consider persisting model selection to localStorage if needed
- Add model selection persistence across sessions (optional)
- Consider adding model selection to chat metadata in database
