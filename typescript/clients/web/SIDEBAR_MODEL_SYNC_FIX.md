# Sidebar Model Selection Sync Fix

## Problem
The model selector in the sidebar settings (`OpenRouterModelAutocomplete`) was saving to localStorage but not notifying the Chat component. This caused:
- Chat component to use the fallback model instead of the selected model
- Title generation to use the wrong model
- Model selection not taking effect immediately

## Root Cause
The sidebar's `handleModelChange` function only updated localStorage but didn't dispatch the `'chat-model-updated'` event that the Chat component listens for.

## Solution
1. **Sidebar dispatches event** - Added event dispatch in `handleModelChange`
2. **Chat loads from localStorage** - Chat component now checks localStorage on initialization

## Changes Made

### 1. **Sidebar User Nav** (`components/sidebar-user-nav.tsx`)

**Before:**
```typescript
const handleModelChange = (value: string) => {
  setSelectedModel(value);
  if (value) {
    localStorage.setItem('selected_model', value);
  } else {
    localStorage.removeItem('selected_model');
  }
};
```

**After:**
```typescript
const handleModelChange = (value: string) => {
  setSelectedModel(value);
  if (value) {
    localStorage.setItem('selected_model', value);
  } else {
    localStorage.removeItem('selected_model');
  }
  // Dispatch event to notify Chat component of model change
  window.dispatchEvent(new CustomEvent('chat-model-updated', { detail: { modelId: value } }));
};
```

### 2. **Chat Component** (`components/chat.tsx`)

**Before:**
```typescript
const [selectedChatModel, setSelectedChatModel] = useState(initialSelectedChatModel);
```

**After:**
```typescript
const [selectedChatModel, setSelectedChatModel] = useState(() => {
  // Try to load from localStorage first, fallback to initial prop
  if (typeof window !== 'undefined') {
    const savedModel = localStorage.getItem('selected_model');
    if (savedModel) {
      return savedModel;
    }
  }
  return initialSelectedChatModel;
});
```

## How It Works Now

### Model Selection Flow
1. **User opens sidebar settings**
2. **User selects a model** in `OpenRouterModelAutocomplete`
3. **`handleModelChange` is called:**
   - Updates local state
   - Saves to localStorage
   - **Dispatches `'chat-model-updated'` event** ⭐
4. **Chat component receives event:**
   - Updates `selectedChatModel` state
   - Next API call uses the correct model
5. **Title generation** receives the correct model parameter

### Initial Load Flow
1. **Chat component initializes**
2. **Checks localStorage** for `'selected_model'`
3. **If found:** Uses saved model
4. **If not found:** Uses `initialSelectedChatModel` prop (DEFAULT_CHAT_MODEL)

## Benefits

✅ **Sidebar model selection works** - Changes take effect immediately
✅ **Persists across sessions** - Model saved in localStorage
✅ **No more fallback model** - Uses the actual selected model
✅ **Consistent with dropdown selector** - Both use the same event system
✅ **Title generation uses correct model** - No more 402 errors from wrong model

## Model Selection Sources

Now there are **two ways** to select a model, both working correctly:

1. **Model Selector Dropdown** (in header)
   - Dispatches `'chat-model-updated'` event
   - Updates Chat component immediately

2. **Sidebar Settings** (OpenRouterModelAutocomplete)
   - Saves to localStorage
   - Dispatches `'chat-model-updated'` event
   - Updates Chat component immediately

Both methods are synchronized through:
- **Event system**: `'chat-model-updated'` custom event
- **localStorage**: `'selected_model'` key

## Testing

1. Open sidebar settings
2. Select a different model (e.g., "anthropic/claude-3.5-sonnet")
3. Close settings
4. Send a message
5. Check network tab - should use the selected model
6. Check title generation - should use the selected model
7. Refresh page - model selection should persist

## Files Modified

- `components/sidebar-user-nav.tsx` - Added event dispatch
- `components/chat.tsx` - Load from localStorage on init

## Related Issues

This completes the model selection refactor:
- ✅ Removed cookie dependency
- ✅ Fixed dropdown model selector
- ✅ Fixed sidebar model selector
- ✅ Fixed title generation model
- ✅ All model selections now work correctly
