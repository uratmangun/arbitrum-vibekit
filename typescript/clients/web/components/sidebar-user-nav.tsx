'use client';
import { ChevronUp, Settings, Eye, EyeOff } from 'lucide-react';
import type { User } from 'next-auth';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { WalletIcon } from './icons';
import { OpenRouterModelAutocomplete } from './openrouter-model-autocomplete';
import { AddMCPServerDialog } from './add-mcp-server-dialog';
import {
  loadMCPServers,
  saveMCPServers,
  addMCPServer,
  removeMCPServer,
  toggleMCPServer,
  type MCPServer,
} from '@/lib/mcp-server-config';

export function SidebarUserNav({ user }: { user: User }) {
  const { setTheme, theme } = useTheme();
  const [selectedModel, setSelectedModel] = useState<string>('google/gemini-2.5-pro-preview');
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [isAddServerDialogOpen, setIsAddServerDialogOpen] = useState(false);

  // Load API key, selected model, and MCP servers from localStorage on mount
  React.useEffect(() => {
    const savedApiKey = localStorage.getItem('openrouter_api_key');
    if (savedApiKey) {
      setOpenRouterApiKey(savedApiKey);
    }
    
    const savedModel = localStorage.getItem('selected_model');
    if (savedModel) {
      setSelectedModel(savedModel);
    }
    
    const servers = loadMCPServers();
    setMcpServers(servers);
  }, []);

  // Save API key to localStorage when it changes
  const handleApiKeyChange = (value: string) => {
    setOpenRouterApiKey(value);
    if (value) {
      localStorage.setItem('openrouter_api_key', value);
    } else {
      localStorage.removeItem('openrouter_api_key');
    }
  };

  // Save selected model to localStorage when it changes
  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    if (value) {
      localStorage.setItem('selected_model', value);
    } else {
      localStorage.removeItem('selected_model');
    }
  };

  // MCP Server handlers
  const handleAddServer = (server: Omit<MCPServer, 'id'>) => {
    const newServer = addMCPServer(server);
    setMcpServers(loadMCPServers());
  };

  const handleToggleServer = (id: string) => {
    toggleMCPServer(id);
    setMcpServers(loadMCPServers());
  };

  const handleRemoveServer = (id: string) => {
    if (confirm('Are you sure you want to remove this MCP server?')) {
      removeMCPServer(id);
      setMcpServers(loadMCPServers());
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent bg-background data-[state=open]:text-sidebar-accent-foreground h-10">
              <WalletIcon size={24} />
              <span className="truncate">{user?.address}</span>
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            className="w-[--radix-popper-anchor-width]"
          >
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {`Toggle ${theme === 'light' ? 'dark' : 'light'} mode`}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setIsSettingsOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <button
                type="button"
                className="w-full cursor-pointer"
                onClick={() => {
                  signOut({
                    redirectTo: '/',
                  });
                }}
              >
                Sign out
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Configure your application preferences and settings.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4 overflow-y-auto flex-1">
              {/* AI Model Selector */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">AI Model</h3>
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select Model</label>
                      <OpenRouterModelAutocomplete
                        value={selectedModel}
                        onValueChange={handleModelChange}
                        apiKey={openRouterApiKey}
                      />
                    </div>
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground">
                        Search and select from 400+ OpenRouter AI models
                      </p>
                    </div>
                  </div>
                </div>

                {/* OpenRouter API Key */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">OpenRouter API Key (Optional)</h3>
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Your API Key</label>
                      <div className="relative">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="sk-or-v1-..."
                          value={openRouterApiKey}
                          onChange={(e) => handleApiKeyChange(e.target.value)}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground">
                        Provide your own OpenRouter API key to use custom rate limits. Leave empty to use the default key.
                      </p>
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-block mt-1"
                      >
                        Get your API key →
                      </a>
                    </div>
                  </div>
                </div>

                {/* MCP Servers Selection */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">MCP Servers</h3>
                  <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-xs text-muted-foreground mb-3">
                      Enable Model Context Protocol servers for extended functionality
                    </p>
                    
                    {/* MCP Server List */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {mcpServers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p className="text-sm mb-2">No MCP servers configured yet</p>
                          <p className="text-xs">Click "+ Add Custom MCP Server" below to get started</p>
                        </div>
                      ) : (
                        mcpServers.map((server) => (
                        <div
                          key={server.id}
                          className="flex items-start justify-between p-3 rounded-md border hover:bg-accent/50 transition-colors"
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium cursor-pointer">
                                {server.name}
                              </label>
                              {server.enabled && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400">
                                  Active
                                </span>
                              )}
                              {server.isCustom && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
                                  Custom
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {server.description}
                            </p>
                            {server.url && (
                              <p className="text-xs text-muted-foreground/70 font-mono truncate">
                                {server.url}
                              </p>
                            )}
                            {server.headers && Object.keys(server.headers).length > 0 && (
                              <p className="text-xs text-muted-foreground/70">
                                🔒 {Object.keys(server.headers).length} custom header{Object.keys(server.headers).length !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 mt-1 cursor-pointer"
                              checked={server.enabled}
                              onChange={() => handleToggleServer(server.id)}
                            />
                            {server.isCustom && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveServer(server.id)}
                              >
                                ×
                              </Button>
                            )}
                          </div>
                        </div>
                        ))
                      )}
                    </div>

                    <div className="pt-2 border-t">
                      <button
                        type="button"
                        onClick={() => setIsAddServerDialogOpen(true)}
                        className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                      >
                        + Add Custom MCP Server
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add MCP Server Dialog */}
        <AddMCPServerDialog
          open={isAddServerDialogOpen}
          onOpenChange={setIsAddServerDialogOpen}
          onAdd={handleAddServer}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
