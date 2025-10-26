# MCP useState Timing Fix

## Problem

Even though `localStorage` had MCP server data, the `mcpServers` state was empty when passed to `useChat`. This caused the server to receive an empty array.

### Root Cause: React Hook Timing

```typescript
// ❌ WRONG: useEffect runs AFTER useChat initialization
const [mcpServers, setMcpServers] = useState([]);  // 1. Empty initially

useEffect(() => {
  const data = localStorage.getItem('...');
  setMcpServers(JSON.parse(data));  // 3. Updates state (too late!)
}, []);

useChat({
  body: {
    context: { mcpServers }  // 2. Captures empty [] value
  }
});
```

### Execution Order:

```
1. Component renders
2. useState([]) → mcpServers = []
3. useChat() called with empty mcpServers
4. useEffect() runs
5. setMcpServers() updates state
6. Component re-renders, but useChat already initialized with []
```

## Solution: Lazy Initialization

Use `useState` with a function to load data synchronously during initialization:

```typescript
// ✅ CORRECT: Load data during state initialization
const [mcpServers] = useState(() => {
  // This function runs ONCE during initialization
  const stored = localStorage.getItem('mcp_servers_config');
  if (stored) {
    const servers = JSON.parse(stored);
    console.log('[Chat] Loaded MCP servers:', servers.length);
    return servers;  // Initial state has data!
  }
  return [];
});

useChat({
  body: {
    context: { mcpServers }  // Now has data from the start
  }
});
```

### Execution Order (Fixed):

```
1. Component renders
2. useState(() => loadFromLocalStorage()) → mcpServers = [data]
3. useChat() called with populated mcpServers ✓
4. Data sent to server ✓
```

## Key Differences

### Before (useEffect):

| Step | State | useChat Body |
|------|-------|--------------|
| Initial render | `[]` | `{ mcpServers: [] }` ❌ |
| After useEffect | `[data]` | Still `{ mcpServers: [] }` ❌ |

**Problem:** `useChat` captures the initial empty state and doesn't update.

### After (Lazy useState):

| Step | State | useChat Body |
|------|-------|--------------|
| Initial render | `[data]` | `{ mcpServers: [data] }` ✓ |

**Solution:** State is populated before `useChat` is called.

## Code Changes

### Before:
```typescript
const [mcpServers, setMcpServers] = useState([]);

useEffect(() => {
  const stored = localStorage.getItem('mcp_servers_config');
  if (stored) {
    setMcpServers(JSON.parse(stored));
  }
}, []);
```

### After:
```typescript
const [mcpServers] = useState(() => {
  try {
    const stored = localStorage.getItem('mcp_servers_config');
    if (stored) {
      const servers = JSON.parse(stored);
      console.log('[Chat] Loaded MCP servers:', servers.length);
      return servers;
    }
  } catch (error) {
    console.error('[Chat] Error loading MCP servers:', error);
  }
  return [];
});
```

## Why This Works

### Lazy Initialization Pattern

React's `useState` accepts a function as the initial value:

```typescript
const [state] = useState(() => {
  // This function runs ONLY ONCE during component mount
  // Perfect for expensive computations or synchronous data loading
  return initialValue;
});
```

**Benefits:**
- ✅ Runs synchronously during initialization
- ✅ Only executes once (not on every render)
- ✅ Data available before other hooks run
- ✅ No race conditions with other hooks

## Testing

### Verify the Fix:

1. **Check localStorage has data:**
```javascript
// In browser console
JSON.parse(localStorage.getItem('mcp_servers_config'))
// Should show: [{name: "...", url: "...", enabled: true, ...}]
```

2. **Check console logs:**
```
[Chat] Loaded MCP servers from localStorage: 1
```

3. **Check server receives data:**
```
[ROUTE] Loading dynamic tools with MCP servers: 1
[getTools] Using MCP servers: [["custom-1761437156292", "https://..."]]
```

4. **Verify in Network tab:**
   - Open DevTools → Network
   - Send a chat message
   - Check `/api/chat` request payload
   - Should see `context.mcpServers` with data

## Common Pitfall: useEffect Timing

Many developers make this mistake:

```typescript
// ❌ Common mistake
const [data, setData] = useState(null);

useEffect(() => {
  setData(loadData());  // Too late!
}, []);

useSomeHook({
  data  // Will be null on first render
});
```

**Why it fails:**
- `useEffect` runs AFTER the component renders
- Other hooks capture the initial state value
- Updating state later doesn't update already-initialized hooks

**When to use lazy initialization:**
- Loading from localStorage/sessionStorage
- Expensive computations
- Synchronous data that must be available immediately
- Data needed by other hooks during initialization

## Alternative Solutions

### Option 1: Lazy Initialization (Current - Best)
```typescript
const [data] = useState(() => loadFromStorage());
```
✅ Simple, synchronous, no re-renders

### Option 2: useMemo
```typescript
const data = useMemo(() => loadFromStorage(), []);
```
✅ Works, but useMemo is for expensive computations, not data loading

### Option 3: Direct variable
```typescript
const data = loadFromStorage();  // No state
```
❌ Won't trigger re-renders if data changes

### Option 4: useEffect with conditional rendering
```typescript
const [data, setData] = useState(null);
useEffect(() => setData(loadFromStorage()), []);
if (!data) return <Loading />;
```
❌ Extra render, loading state needed

## Summary

**Problem:** `useEffect` runs too late, `useChat` captures empty state

**Solution:** Use lazy `useState` initialization to load data synchronously

**Result:** MCP servers available from the first render ✓

## Files Modified

- ✅ `components/chat.tsx` - Changed from useEffect to lazy useState

The MCP servers are now properly loaded and sent to the server! 🎉
