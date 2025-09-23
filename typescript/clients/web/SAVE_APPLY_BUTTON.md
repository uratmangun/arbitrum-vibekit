# Save & Apply Settings Button

## Overview
Added a "Save & Apply Settings" button to the sidebar settings dialog that allows users to save their changes and navigate to the home page to apply them immediately.

## Problem
When users changed settings (model selection, API key, MCP servers) in the sidebar, the changes were saved to localStorage but didn't take effect immediately in the current chat. Users had to manually navigate away or refresh to see the changes.

## Solution
Added a "Save & Apply Settings" button that:
1. Closes the settings dialog
2. Redirects to the home page (`/`)
3. Allows the Chat component to reinitialize with new settings

## Implementation

### Changes Made

#### 1. **Added Imports**
```typescript
import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
```

#### 2. **Added Router Hook**
```typescript
export function SidebarUserNav({ user }: { user: User }) {
  const router = useRouter();
  // ... rest of state
}
```

#### 3. **Added Handler Function**
```typescript
// Handle save and apply settings
const handleSaveAndApply = () => {
  // Close the settings dialog
  setIsSettingsOpen(false);
  // Redirect to home page to apply changes
  router.push('/');
};
```

#### 4. **Added Button UI**
```typescript
<div className="pt-2 border-t space-y-2">
  <button
    type="button"
    onClick={() => setIsAddServerDialogOpen(true)}
    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
  >
    + Add Custom MCP Server
  </button>
  <Button
    onClick={handleSaveAndApply}
    className="w-full"
    size="sm"
  >
    <Save className="h-4 w-4 mr-2" />
    Save & Apply Settings
  </Button>
</div>
```

## User Flow

### Before
1. User opens settings
2. User changes model/API key/MCP servers
3. Changes saved to localStorage
4. User closes settings
5. **Changes don't take effect** in current chat
6. User must manually navigate away or refresh

### After
1. User opens settings
2. User changes model/API key/MCP servers
3. Changes saved to localStorage
4. User clicks **"Save & Apply Settings"**
5. Settings dialog closes
6. **Redirects to home page** (`/`)
7. **Changes take effect immediately** in new chat

## Why Redirect to Home?

Redirecting to `/` instead of staying on the current chat page ensures:

1. **Clean State** - New chat starts with fresh settings
2. **No Conflicts** - Avoids mid-conversation model/server changes
3. **Clear UX** - User knows settings have been applied
4. **Proper Initialization** - Chat component loads with new settings from localStorage

## Button Placement

The button is placed:
- **Below** the "Add Custom MCP Server" button
- **At the bottom** of the MCP Servers section
- **Full width** for easy clicking
- **With icon** (Save icon) for visual clarity

## Visual Design

- **Primary button style** - Stands out as the main action
- **Save icon** - Clear indication of saving action
- **Full width** - Easy to click
- **Small size** - Fits well in the dialog
- **Proper spacing** - `space-y-2` between buttons

## Benefits

✅ **Immediate feedback** - Changes apply right away
✅ **Clear action** - Users know how to apply settings
✅ **Better UX** - No confusion about when changes take effect
✅ **Clean navigation** - Starts fresh chat with new settings
✅ **Prevents errors** - Avoids mid-conversation setting changes

## Alternative Approaches Considered

### 1. Auto-save and reload current page
❌ Would interrupt ongoing conversation
❌ Could lose unsaved messages

### 2. Apply without navigation
❌ Complex state management
❌ Potential race conditions
❌ Harder to ensure all components update

### 3. Show notification only
❌ User still needs to navigate manually
❌ Doesn't provide clear action

## File Modified

- `components/sidebar-user-nav.tsx` - Added button and handler

## Testing

1. Open sidebar settings
2. Change model selection
3. Change API key
4. Add/remove MCP servers
5. Click "Save & Apply Settings"
6. Verify redirected to home page
7. Verify settings are applied in new chat
8. Test model selection works
9. Test API key is used
10. Test MCP servers are loaded

## Future Improvements

- Add loading state while redirecting
- Add toast notification "Settings applied successfully"
- Add confirmation dialog if there are unsaved changes
- Add keyboard shortcut (Ctrl+S / Cmd+S)
- Remember last chat and offer to return
