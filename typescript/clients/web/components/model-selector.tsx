'use client';

import { startTransition, useMemo, useOptimistic, useState, useEffect } from 'react';

import { saveChatModelAsCookie } from '@/app/(chat)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { chatModels } from '@/lib/ai/models';
import type { OpenRouterModel } from '@/lib/ai/openrouter-types';
import { cn } from '@/lib/utils';

import { CheckCircleFillIcon, ChevronDownIcon } from './icons';

export function ModelSelector({
  selectedModelId,
  className,
}: {
  selectedModelId: string;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);
  const [optimisticModelId, setOptimisticModelId] =
    useOptimistic(selectedModelId);
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch models from OpenRouter API with debouncing
  useEffect(() => {
    if (!open) return;

    const fetchModels = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/models?search=${encodeURIComponent(searchQuery)}&limit=50`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }
        const data = await response.json();
        setModels(data.data || []);
      } catch (err) {
        console.error('Error fetching models:', err);
        setError('Failed to load models');
        // Fallback to local models
        setModels([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce search queries
    const timeoutId = setTimeout(() => {
      fetchModels();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [open, searchQuery]);

  const selectedChatModel = useMemo(() => {
    // First try to find in OpenRouter models
    const openRouterModel = models.find((model) => model.id === optimisticModelId);
    if (openRouterModel) {
      return {
        id: openRouterModel.id,
        name: openRouterModel.name,
        description: openRouterModel.description,
      };
    }
    // Fallback to local models
    return chatModels.find((chatModel) => chatModel.id === optimisticModelId);
  }, [optimisticModelId, models]);

  // Combine local models with OpenRouter models
  const allModels = useMemo(() => {
    const localModelsMap = new Map(chatModels.map((m) => [m.id, m]));
    const openRouterModelsFormatted = models.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description || `Context: ${model.context_length}`,
    }));
    
    // Merge, preferring OpenRouter models
    const merged = [...openRouterModelsFormatted];
    chatModels.forEach((localModel) => {
      if (!merged.find((m) => m.id === localModel.id)) {
        merged.unshift(localModel);
      }
    });
    
    return merged;
  }, [models]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button
          data-testid="model-selector"
          variant="outline"
          className="md:px-2 md:h-[34px]"
        >
          {selectedChatModel?.name || 'Select Model'}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[400px] max-h-[500px] overflow-hidden flex flex-col">
        <div className="p-2 border-b sticky top-0 bg-background z-10">
          <Input
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading models...
            </div>
          )}
          {error && (
            <div className="p-4 text-center text-sm text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && allModels.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No models found
            </div>
          )}
          {!loading && !error && allModels.map((chatModel) => {
            const { id } = chatModel;

            return (
              <DropdownMenuItem
                data-testid={`model-selector-item-${id}`}
                key={id}
                onSelect={() => {
                  setOpen(false);
                  setSearchQuery('');

                  startTransition(() => {
                    setOptimisticModelId(id);
                    saveChatModelAsCookie(id);
                  });
                }}
                data-active={id === optimisticModelId}
                asChild
              >
                <button
                  type="button"
                  className="gap-4 group/item flex flex-row justify-between items-center w-full px-2 py-2"
                >
                  <div className="flex flex-col gap-1 items-start flex-1 min-w-0">
                    <div className="font-medium text-sm truncate w-full">{chatModel.name}</div>
                    <div className="text-xs text-muted-foreground truncate w-full">
                      {chatModel.description}
                    </div>
                  </div>

                  <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100 flex-shrink-0">
                    <CheckCircleFillIcon />
                  </div>
                </button>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
