'use client';

import { useMemo, useOptimistic, useState } from 'react';

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

  const selectedChatModel = useMemo(() => {
    return chatModels.find((chatModel) => chatModel.id === optimisticModelId);
  }, [optimisticModelId]);

  // Filter local models based on search
  const filteredModels = useMemo(() => {
    if (!searchQuery) return chatModels;
    const query = searchQuery.toLowerCase();
    return chatModels.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

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
          {filteredModels.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No models found
            </div>
          )}
          {filteredModels.map((chatModel) => {
            const { id } = chatModel;

            return (
              <DropdownMenuItem
                data-testid={`model-selector-item-${id}`}
                key={id}
                onSelect={() => {
                  setOpen(false);
                  setSearchQuery('');
                  setOptimisticModelId(id);
                  // Dispatch custom event to notify Chat component immediately
                  window.dispatchEvent(new CustomEvent('chat-model-updated', { detail: { modelId: id } }));
                }}
                data-active={id === optimisticModelId}
                asChild
              >
                <button
                  type="button"
                  className="gap-4 group/item flex flex-row justify-between items-center w-full p-2"
                >
                  <div className="flex flex-col gap-1 items-start flex-1 min-w-0">
                    <div className="font-medium text-sm truncate w-full">{chatModel.name}</div>
                    <div className="text-xs text-muted-foreground truncate w-full">
                      {chatModel.description}
                    </div>
                  </div>

                  <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100 shrink-0">
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
