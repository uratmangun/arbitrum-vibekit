export type ProviderType = 'openai-compatible';

export interface AIProviderProfile {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey?: string; // OpenAI-compatible provider API key
  model?: string; // optional preferred model id
  isActive?: boolean;
}

export const DEFAULT_AI_PROVIDERS: AIProviderProfile[] = [];

export const AI_PROVIDERS_STORAGE_KEY = 'ai_providers_config';

export function loadAIProviders(): AIProviderProfile[] {
  if (typeof window === 'undefined') return DEFAULT_AI_PROVIDERS;
  try {
    const stored = window.localStorage.getItem(AI_PROVIDERS_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as AIProviderProfile[];
  } catch (error) {
    console.error('Error loading AI providers:', error);
  }
  return DEFAULT_AI_PROVIDERS;
}

export function saveAIProviders(profiles: AIProviderProfile[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AI_PROVIDERS_STORAGE_KEY, JSON.stringify(profiles));
    window.dispatchEvent(new Event('ai-providers-updated'));
  } catch (error) {
    console.error('Error saving AI providers:', error);
  }
}

export function addAIProvider(profile: Omit<AIProviderProfile, 'id'>): AIProviderProfile {
  const newProfile: AIProviderProfile = {
    ...profile,
    id: `prov-${Date.now()}`,
  };
  const profiles = loadAIProviders();
  profiles.push(newProfile);
  saveAIProviders(profiles);
  return newProfile;
}

export function removeAIProvider(id: string): void {
  const profiles = loadAIProviders();
  const filtered = profiles.filter((p) => p.id !== id);
  saveAIProviders(filtered);
}

export function updateAIProvider(id: string, updates: Partial<AIProviderProfile>): void {
  const profiles = loadAIProviders();
  const updated = profiles.map((p) => (p.id === id ? { ...p, ...updates } : p));
  saveAIProviders(updated);
}

export function setActiveAIProvider(id: string): void {
  const profiles = loadAIProviders();
  const updated = profiles.map((p) => ({ ...p, isActive: p.id === id }));
  saveAIProviders(updated);
}

export function getActiveAIProvider(): AIProviderProfile | null {
  const profiles = loadAIProviders();
  return profiles.find((p) => p.isActive) ?? null;
}

export function deactivateAllProviders(): void {
  const profiles = loadAIProviders();
  const updated = profiles.map((p) => ({ ...p, isActive: false }));
  saveAIProviders(updated);
}
