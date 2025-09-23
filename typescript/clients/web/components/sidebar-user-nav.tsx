'use client';
import { ChevronUp, Settings, Eye, EyeOff, Pencil, Save } from 'lucide-react';
import type { User } from 'next-auth';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import * as React from 'react';
import { useRouter } from 'next/navigation';

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
import { EditMCPServerDialog } from './edit-mcp-server-dialog';
import {
  loadMCPServers,
  saveMCPServers,
  addMCPServer,
  removeMCPServer,
  toggleMCPServer,
  updateMCPServer,
  type MCPServer,
} from '@/lib/mcp-server-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type AIProviderProfile,
  addAIProvider,
  loadAIProviders,
  removeAIProvider,
  setActiveAIProvider,
  deactivateAllProviders,
} from '@/lib/ai-provider-config';

export function SidebarUserNav({ user }: { user: User }) {
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const [selectedModel, setSelectedModel] = useState<string>('google/gemini-2.5-pro-preview');
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [providerType, setProviderType] = useState<'openrouter' | 'openai-compatible'>('openrouter');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [providerApiKey, setProviderApiKey] = useState<string>('');
  const [showProviderApiKey, setShowProviderApiKey] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [isAddServerDialogOpen, setIsAddServerDialogOpen] = useState(false);
  const [isEditServerDialogOpen, setIsEditServerDialogOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState<MCPServer | null>(null);
  const [aiProviders, setAiProviders] = useState<AIProviderProfile[]>([]);
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('');

  // Load API key, selected model, and MCP servers from localStorage on mount
  React.useEffect(() => {
    const savedProviderType = localStorage.getItem('provider_type') as 'openrouter' | 'openai-compatible' | null;
    if (savedProviderType) {
      setProviderType(savedProviderType);
    }
    const savedBaseUrl = localStorage.getItem('provider_api_base_url');
    if (savedBaseUrl) {
      setApiBaseUrl(savedBaseUrl);
    }
    const savedProviderKey = localStorage.getItem('provider_api_key');
    if (savedProviderKey) {
      setProviderApiKey(savedProviderKey);
    }
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

    // Load AI provider profiles
    const profiles = loadAIProviders();
    setAiProviders(profiles);

    // Load custom system prompt
    const savedCustomPrompt = localStorage.getItem('custom_system_prompt');
    if (savedCustomPrompt) {
      setCustomSystemPrompt(savedCustomPrompt);
    }

    // Listen for external updates
    const onProvidersUpdated = () => setAiProviders(loadAIProviders());
    window.addEventListener('ai-providers-updated', onProvidersUpdated);
    return () => window.removeEventListener('ai-providers-updated', onProvidersUpdated);
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

  // Save custom system prompt to localStorage when it changes
  const handleCustomSystemPromptChange = (value: string) => {
    setCustomSystemPrompt(value);
    if (value) {
      localStorage.setItem('custom_system_prompt', value);
    } else {
      localStorage.removeItem('custom_system_prompt');
    }
    // Dispatch event to notify Chat component of prompt change
    window.dispatchEvent(new CustomEvent('system-prompt-updated', { detail: { customPrompt: value } }));
  };

  // Saved AI Providers helpers
  const buildProfileFromCurrent = (): Omit<AIProviderProfile, 'id'> => ({
    name:
      providerType === 'openrouter'
        ? `OpenRouter (${selectedModel || 'model'})`
        : `Custom (${new URL(apiBaseUrl || 'https://openrouter.ai').host})`,
    type: providerType,
    baseUrl: providerType === 'openai-compatible' ? apiBaseUrl : undefined,
    apiKey: providerType === 'openai-compatible' ? providerApiKey : openRouterApiKey,
    model: selectedModel,
    isActive: false,
  });

  const handleSaveCurrentAsProfile = () => {
    const name = prompt('Name this provider profile', buildProfileFromCurrent().name) || undefined;
    const base = buildProfileFromCurrent();
    const profile = addAIProvider({ ...base, name: name ?? base.name });
    // Mark as active and refresh list
    setActiveAIProvider(profile.id);
    setAiProviders(loadAIProviders());
  };

  const applyProfileToSettings = (profile: AIProviderProfile) => {
    // Set provider type
    handleProviderTypeChange(profile.type);
    // Apply API key and base URL depending on type
    if (profile.type === 'openrouter') {
      if (profile.apiKey) handleApiKeyChange(profile.apiKey);
      // Clear OpenAI-compatible fields
      handleApiBaseUrlChange('');
      handleProviderApiKeyChange('');
    } else {
      handleApiBaseUrlChange(profile.baseUrl || '');
      if (profile.apiKey) handleProviderApiKeyChange(profile.apiKey);
    }
    // Apply model if provided
    if (profile.model) handleModelChange(profile.model);
  };

  const handleUseProfile = (profile: AIProviderProfile) => {
    setActiveAIProvider(profile.id);
    setAiProviders(loadAIProviders());
    applyProfileToSettings(profile);
  };

  const handleDeleteProfile = (id: string) => {
    if (confirm('Delete this provider profile?')) {
      removeAIProvider(id);
      setAiProviders(loadAIProviders());
    }
  };

  const handleDeactivateAll = () => {
    deactivateAllProviders();
    setAiProviders(loadAIProviders());
  };

  // Provider settings handlers
  const handleProviderTypeChange = (value: 'openrouter' | 'openai-compatible') => {
    setProviderType(value);
    localStorage.setItem('provider_type', value);

    // If switching to OpenAI-compatible, prefill defaults using OpenRouter-compatible base
    if (value === 'openai-compatible') {
      if (!apiBaseUrl) {
        const defaultUrl = 'https://openrouter.ai/api/v1';
        setApiBaseUrl(defaultUrl);
        localStorage.setItem('provider_api_base_url', defaultUrl);
      }
      // If provider API key is empty but OpenRouter key exists, reuse it
      if (!providerApiKey && openRouterApiKey) {
        setProviderApiKey(openRouterApiKey);
        localStorage.setItem('provider_api_key', openRouterApiKey);
      }
    }
  };

  const handleApiBaseUrlChange = (value: string) => {
    setApiBaseUrl(value);
    if (value) {
      localStorage.setItem('provider_api_base_url', value);
    } else {
      localStorage.removeItem('provider_api_base_url');
    }
  };

  const handleProviderApiKeyChange = (value: string) => {
    setProviderApiKey(value);
    if (value) {
      localStorage.setItem('provider_api_key', value);
    } else {
      localStorage.removeItem('provider_api_key');
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
    // Dispatch event to notify Chat component of model change
    window.dispatchEvent(new CustomEvent('chat-model-updated', { detail: { modelId: value } }));
  };

  // MCP Server handlers
  const handleAddServer = (server: Omit<MCPServer, 'id'>) => {
    const newServer = addMCPServer(server);
    setMcpServers(loadMCPServers());
    
    // Refresh the page to reload tools on the server
    // Use setTimeout to ensure state updates complete before reload
    setTimeout(() => {
      window.location.reload();
    }, 100);
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

  const handleEditServer = (server: MCPServer) => {
    setServerToEdit(server);
    setIsEditServerDialogOpen(true);
  };

  const handleSaveServerEdit = (id: string, updates: Partial<MCPServer>) => {
    updateMCPServer(id, updates);
    setMcpServers(loadMCPServers());
    setServerToEdit(null);
    
    // Refresh the page to reload tools on the server
    // Use setTimeout to ensure state updates complete before reload
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // Handle save and apply settings
  const handleSaveAndApply = () => {
    // Close the settings dialog
    setIsSettingsOpen(false);
    // Redirect to home page to apply changes
    router.push('/');
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
              {/* Custom System Prompt */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Custom System Prompt (Optional)</h3>
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Override System Prompt</label>
                    <textarea
                      placeholder="Enter custom system prompt to override the default behavior. Leave empty to use the default prompt."
                      value={customSystemPrompt}
                      onChange={(e) => handleCustomSystemPromptChange(e.target.value)}
                      className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    />
                  </div>
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground">
                      When provided, this custom prompt will replace the default system prompt. Leave empty to use the default DeFi assistant behavior.
                    </p>
                  </div>
                </div>
              </div>

              {/* Saved Providers */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Saved Providers</h3>
                <div className="rounded-lg border p-4 space-y-3">
                  {!aiProviders.some(p => p.isActive) && (
                    <div className="flex items-start gap-3 rounded-md border p-3 bg-blue-500/10 border-blue-500/30">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Default Provider (from .env)</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Using environment variable configuration
                        </p>
                      </div>
                    </div>
                  )}
                  {aiProviders.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No saved providers yet. Using default from environment.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[240px] overflow-y-auto">
                      {aiProviders.map((p) => (
                        <div key={p.id} className="flex items-start justify-between gap-3 rounded-md border p-3 hover:bg-accent/50">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium truncate">{p.name}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/80">
                                {p.type === 'openrouter' ? 'OpenRouter' : 'OpenAI-compatible'}
                              </span>
                              {p.isActive && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {p.type === 'openrouter'
                                ? `Model: ${p.model ?? '-'} | Key: ${p.apiKey ? '•••••' : '—'}`
                                : `Base: ${p.baseUrl ?? '-'} | Model: ${p.model ?? '-'} | Key: ${p.apiKey ? '•••••' : '—'}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {p.isActive ? (
                              <Button size="sm" variant="outline" onClick={handleDeactivateAll}>
                                Deactivate
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleUseProfile(p)}>
                                Use
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteProfile(p.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Provider Selector */
              }
              <div className="space-y-2">
                <h3 className="text-sm font-medium">AI Provider</h3>
                <div className="rounded-lg border p-4 space-y-3">
                  <Select
                    value={providerType}
                    onValueChange={(v) => handleProviderTypeChange(v as 'openrouter' | 'openai-compatible')}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="openai-compatible">OpenAI-compatible</SelectItem>
                    </SelectContent>
                  </Select>

                  {providerType === 'openai-compatible' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-medium">Base URL</label>
                        <Input
                          placeholder="https://api.example.com/v1"
                          value={apiBaseUrl}
                          onChange={(e) => handleApiBaseUrlChange(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-medium">Provider API Key</label>
                        <div className="relative">
                          <Input
                            type={showProviderApiKey ? 'text' : 'password'}
                            placeholder="sk-..."
                            value={providerApiKey}
                            onChange={(e) => handleProviderApiKeyChange(e.target.value)}
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowProviderApiKey(!showProviderApiKey)}
                            title={showProviderApiKey ? 'Hide key' : 'Show key'}
                          >
                            {showProviderApiKey ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Provide your custom provider base URL and API key for any OpenAI-compatible service.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Model Selector */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">AI Model</h3>
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select Model</label>
                      {providerType === 'openrouter' ? (
                        <OpenRouterModelAutocomplete
                          value={selectedModel}
                          onValueChange={handleModelChange}
                          apiKey={openRouterApiKey}
                        />
                      ) : (
                        <Input
                          placeholder="e.g. gpt-4o-mini or llama-3.1-70b-instruct"
                          value={selectedModel}
                          onChange={(e) => handleModelChange(e.target.value)}
                        />
                      )}
                    </div>
                    <div className="pt-2">
                      {providerType === 'openrouter' ? (
                        <p className="text-xs text-muted-foreground">
                          Search and select from 400+ OpenRouter AI models
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Enter the exact model ID supported by your provider
                        </p>
                      )}
                    </div>
                    <div className="pt-2 border-t">
                      <Button size="sm" onClick={handleSaveCurrentAsProfile}>
                        <Save className="h-4 w-4 mr-2" />
                        Save current as provider profile
                      </Button>
                    </div>
                  </div>
                </div>

                {/* OpenRouter API Key */}
                {providerType === 'openrouter' && (
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
                )}

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
                          <div className="space-y-1 flex-1 min-w-0">
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
                            {server.selectedTools && server.selectedTools.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                🔧 {server.selectedTools.length} tool{server.selectedTools.length !== 1 ? 's' : ''} active
                              </p>
                            )}
                            {server.url && (
                              <p className="text-xs text-muted-foreground/70 font-mono truncate block max-w-xs overflow-hidden">
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
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 hover:bg-accent"
                                  onClick={() => handleEditServer(server)}
                                  title="Edit server"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  onClick={() => handleRemoveServer(server.id)}
                                  title="Remove server"
                                >
                                  ×
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        ))
                      )}
                    </div>

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

        {/* Edit MCP Server Dialog */}
        <EditMCPServerDialog
          open={isEditServerDialogOpen}
          onOpenChange={setIsEditServerDialogOpen}
          server={serverToEdit}
          onSave={handleSaveServerEdit}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
