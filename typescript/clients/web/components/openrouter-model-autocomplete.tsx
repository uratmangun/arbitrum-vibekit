'use client';

import * as React from 'react';
import { Autocomplete, type AutocompleteOption } from '@/components/ui/autocomplete';
import type { OpenRouterModel } from '@/lib/ai/openrouter-types';

interface OpenRouterModelAutocompleteProps {
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  apiKey?: string;
}

export function OpenRouterModelAutocomplete({
  value,
  onValueChange,
  className,
  apiKey,
}: OpenRouterModelAutocompleteProps) {
  const [options, setOptions] = React.useState<AutocompleteOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Fetch models with debouncing
  React.useEffect(() => {
    const fetchModels = async () => {
      setLoading(true);
      try {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        
        // Add custom API key if provided
        if (apiKey) {
          headers['x-openrouter-api-key'] = apiKey;
        }

        const response = await fetch(
          `/api/models?search=${encodeURIComponent(searchQuery)}&limit=100`,
          { headers }
        );
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }
        const data = await response.json();
        const models: OpenRouterModel[] = data.data || [];
        
        // Filter models based on required criteria
        const filteredModels = models.filter((model) => {
          // Check if model has required supported parameters
          const hasToolSupport = 
            model.supported_parameters?.includes('tool_choice') &&
            model.supported_parameters?.includes('tools');
          
          // Check if input modalities include text
          const hasTextInput = model.architecture?.input_modalities?.includes('text');
          
          // Check if output modalities only include text (no other modalities)
          const hasOnlyTextOutput = 
            model.architecture?.output_modalities?.length === 1 &&
            model.architecture?.output_modalities?.includes('text');
          
          return hasToolSupport && hasTextInput && hasOnlyTextOutput;
        });
        
        setOptions(
          filteredModels.map((model) => ({
            value: model.id,
            label: model.name,
            description: `${model.description?.slice(0, 80) || ''}${model.description && model.description.length > 80 ? '...' : ''}`,
          }))
        );
      } catch (err) {
        console.error('Error fetching models:', err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchModels();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, apiKey]);

  return (
    <Autocomplete
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder="Select a model..."
      searchPlaceholder="Search OpenRouter models..."
      emptyText="No models found"
      className={className}
      loading={loading}
      onSearchChange={setSearchQuery}
    />
  );
}
