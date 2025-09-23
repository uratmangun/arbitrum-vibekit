'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  introspectMCPServer,
  isValidMCPServerUrl,
  type MCPTool,
} from './mcp-server-introspection';
import type { MCPServer } from '@/lib/mcp-server-config';

interface EditMCPServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: MCPServer | null;
  onSave: (id: string, updates: Partial<MCPServer>) => void;
}

export function EditMCPServerDialog({
  open,
  onOpenChange,
  server,
  onSave,
}: EditMCPServerDialogProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [isIntrospecting, setIsIntrospecting] = React.useState(false);
  const [introspectionError, setIntrospectionError] = React.useState<string | null>(null);
  const [discoveredTools, setDiscoveredTools] = React.useState<MCPTool[]>([]);
  const [selectedTools, setSelectedTools] = React.useState<Set<string>>(new Set());
  const [protocol, setProtocol] = React.useState<'http' | 'sse'>('http');
  const [headers, setHeaders] = React.useState<Array<{ key: string; value: string }>>([]);

  // Initialize form when server changes
  React.useEffect(() => {
    if (server && open) {
      setName(server.name);
      setDescription(server.description);
      setUrl(server.url);
      setSelectedTools(new Set(server.selectedTools || []));
      
      // Convert headers object to array
      if (server.headers) {
        const headersArray = Object.entries(server.headers).map(([key, value]) => ({
          key,
          value,
        }));
        setHeaders(headersArray);
      } else {
        setHeaders([]);
      }
      
      // Reset introspection state
      setDiscoveredTools([]);
      setIntrospectionError(null);
    }
  }, [server, open]);

  const handleIntrospect = async () => {
    if (!url.trim() || !isValidMCPServerUrl(url)) {
      setIntrospectionError('Please enter a valid URL (http:// or https://)');
      return;
    }

    // Convert headers array to object
    const headersObj: Record<string, string> | undefined = headers.length > 0
      ? headers.reduce((acc, { key, value }) => {
          if (key.trim() && value.trim()) {
            acc[key.trim()] = value.trim();
          }
          return acc;
        }, {} as Record<string, string>)
      : undefined;

    setIsIntrospecting(true);
    setIntrospectionError(null);
    setDiscoveredTools([]);

    try {
      const serverInfo = await introspectMCPServer(url, protocol, headersObj);
      setDiscoveredTools(serverInfo.tools);
      
      // Keep existing selections if they exist in the new tool list
      const newToolNames = new Set(serverInfo.tools.map(t => t.name));
      const updatedSelection = new Set(
        Array.from(selectedTools).filter(toolName => newToolNames.has(toolName))
      );
      
      // If no tools were previously selected, select all
      if (selectedTools.size === 0) {
        serverInfo.tools.forEach(t => updatedSelection.add(t.name));
      }
      
      setSelectedTools(updatedSelection);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setIntrospectionError(errorMessage);
      setDiscoveredTools([]);
    } finally {
      setIsIntrospecting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!server || !name.trim() || !url.trim()) {
      return;
    }

    // Convert headers array to object
    const headersObj: Record<string, string> | undefined = headers.length > 0
      ? headers.reduce((acc, { key, value }) => {
          if (key.trim() && value.trim()) {
            acc[key.trim()] = value.trim();
          }
          return acc;
        }, {} as Record<string, string>)
      : undefined;

    onSave(server.id, {
      name: name.trim(),
      description: description.trim(),
      url: url.trim(),
      headers: headersObj,
      selectedTools: Array.from(selectedTools),
    });

    // Close dialog first, then reload will happen in parent
    onOpenChange(false);
  };

  if (!server) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit MCP Server</DialogTitle>
            <DialogDescription>
              Update server details and tool selections.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-url">Server URL *</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-url"
                  type="url"
                  placeholder="e.g., http://localhost:3000/mcp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleIntrospect}
                  disabled={isIntrospecting || !url.trim()}
                  className="whitespace-nowrap"
                >
                  {isIntrospecting ? 'Checking...' : 'Re-discover'}
                </Button>
              </div>
            </div>

            {/* Protocol Selection */}
            <div className="grid gap-2">
              <Label htmlFor="edit-protocol">Protocol</Label>
              <select
                id="edit-protocol"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as 'http' | 'sse')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="http">HTTP (Streamable)</option>
                <option value="sse">SSE (Server-Sent Events)</option>
              </select>
            </div>

            {/* Introspection Error */}
            {introspectionError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {introspectionError}
              </div>
            )}

            {/* Discovered Tools */}
            {discoveredTools.length > 0 && (
              <div className="rounded-md bg-green-500/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    ✓ Found {discoveredTools.length} tool{discoveredTools.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTools(new Set(discoveredTools.map(t => t.name)))}
                      className="h-7 text-xs"
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTools(new Set())}
                      className="h-7 text-xs"
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="text-xs space-y-2 max-h-[200px] overflow-y-auto">
                  {discoveredTools.map((tool) => (
                    <div key={tool.name} className="flex items-start gap-2 p-2 rounded hover:bg-green-500/5">
                      <input
                        type="checkbox"
                        id={`edit-tool-${tool.name}`}
                        checked={selectedTools.has(tool.name)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedTools);
                          if (e.target.checked) {
                            newSelected.add(tool.name);
                          } else {
                            newSelected.delete(tool.name);
                          }
                          setSelectedTools(newSelected);
                        }}
                        className="mt-1 h-4 w-4 rounded border-gray-300 cursor-pointer"
                      />
                      <label htmlFor={`edit-tool-${tool.name}`} className="flex-1 cursor-pointer">
                        <div className="font-mono font-medium text-foreground">{tool.name}</div>
                        <div className="text-muted-foreground">{tool.description}</div>
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedTools.size} of {discoveredTools.length} tool{discoveredTools.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}

            {/* Show current tool selection if not re-discovered */}
            {discoveredTools.length === 0 && selectedTools.size > 0 && (
              <div className="rounded-md bg-blue-500/10 p-3 space-y-2">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  Current tool selection ({selectedTools.size} tool{selectedTools.size !== 1 ? 's' : ''})
                </p>
                <div className="text-xs space-y-1 max-h-[150px] overflow-y-auto">
                  {Array.from(selectedTools).map((toolName) => (
                    <div key={toolName} className="flex items-center gap-2 p-1">
                      <span className="text-blue-600 dark:text-blue-400">•</span>
                      <div className="font-mono font-medium">{toolName}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Click "Re-discover" to update tool selections
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="edit-name">Server Name *</Label>
              <Input
                id="edit-name"
                placeholder="e.g., My Custom Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Describe what this server does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Custom Headers */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Custom Headers (Optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHeaders([...headers, { key: '', value: '' }])}
                  className="h-8"
                >
                  + Add Header
                </Button>
              </div>
              
              {headers.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-3">
                  {headers.map((header, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1 grid gap-2">
                        <Input
                          placeholder="Header name (e.g., Authorization)"
                          value={header.key}
                          onChange={(e) => {
                            const newHeaders = [...headers];
                            newHeaders[index].key = e.target.value;
                            setHeaders(newHeaders);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="flex-1 grid gap-2">
                        <Input
                          placeholder="Header value (e.g., Bearer token)"
                          value={header.value}
                          onChange={(e) => {
                            const newHeaders = [...headers];
                            newHeaders[index].value = e.target.value;
                            setHeaders(newHeaders);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newHeaders = headers.filter((_, i) => i !== index);
                          setHeaders(newHeaders);
                        }}
                        className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !url.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
