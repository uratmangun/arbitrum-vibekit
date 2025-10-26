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
  formatToolsForDisplay,
  type MCPTool,
} from './mcp-server-introspection';

interface AddMCPServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (server: {
    name: string;
    description: string;
    url: string;
    enabled: boolean;
    headers?: Record<string, string>;
  }) => void;
}

export function AddMCPServerDialog({
  open,
  onOpenChange,
  onAdd,
}: AddMCPServerDialogProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [enabled, setEnabled] = React.useState(true);
  const [isIntrospecting, setIsIntrospecting] = React.useState(false);
  const [introspectionError, setIntrospectionError] = React.useState<string | null>(null);
  const [discoveredTools, setDiscoveredTools] = React.useState<MCPTool[]>([]);
  const [protocol, setProtocol] = React.useState<'http' | 'sse'>('http');
  const [headers, setHeaders] = React.useState<Array<{ key: string; value: string }>>([]);

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
      
      // Auto-fill name and description if not already set
      if (!name.trim()) {
        setName(serverInfo.name);
      }
      if (!description.trim()) {
        setDescription(serverInfo.description);
      }
      
      setDiscoveredTools(serverInfo.tools);
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
    
    if (!name.trim() || !url.trim()) {
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

    onAdd({
      name: name.trim(),
      description: description.trim(),
      url: url.trim(),
      enabled,
      headers: headersObj,
    });

    // Reset form
    setName('');
    setDescription('');
    setUrl('');
    setEnabled(true);
    setDiscoveredTools([]);
    setIntrospectionError(null);
    setProtocol('http');
    setHeaders([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Custom MCP Server</DialogTitle>
            <DialogDescription>
              Add a new Model Context Protocol server to extend functionality.
              You can auto-discover server details and tools.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="url">Server URL *</Label>
              <div className="flex gap-2">
                <Input
                  id="url"
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
                  {isIntrospecting ? 'Checking...' : 'Discover'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The endpoint URL for your MCP server
              </p>
            </div>

            {/* Protocol Selection */}
            <div className="grid gap-2">
              <Label htmlFor="protocol">Protocol</Label>
              <select
                id="protocol"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as 'http' | 'sse')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="http">HTTP (Streamable)</option>
                <option value="sse">SSE (Server-Sent Events)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Select the transport protocol your MCP server uses
              </p>
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
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  ✓ Found {discoveredTools.length} tool{discoveredTools.length !== 1 ? 's' : ''}
                </p>
                <div className="text-xs text-muted-foreground space-y-1 max-h-[150px] overflow-y-auto">
                  {discoveredTools.map((tool) => (
                    <div key={tool.name} className="flex items-start gap-2">
                      <span className="text-green-600 dark:text-green-400">•</span>
                      <div>
                        <div className="font-mono font-medium">{tool.name}</div>
                        <div className="text-muted-foreground">{tool.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="name">Server Name *</Label>
              <Input
                id="name"
                placeholder="e.g., My Custom Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {discoveredTools.length > 0 && 'Auto-discovered from server'}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this server does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {discoveredTools.length > 0 && 'Auto-discovered from server'}
              </p>
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
              
              <p className="text-xs text-muted-foreground">
                Add custom HTTP headers for authentication or other purposes
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="enabled" className="cursor-pointer">
                Enable immediately
              </Label>
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
              Add Server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
