'use client';

import { useMemo, useOptimistic } from 'react';
import type { Button } from '@/components/ui/button';
import { chatAgents } from '@/agents-config';
import { ChipToggle } from './chips';

export function AgentSelector({
  selectedAgentId,
  className: _className,
  onAgentChange,
}: {
  selectedAgentId: string;
  onAgentChange?: (agentId: string) => void;
} & React.ComponentProps<typeof Button>) {
  const [optimisticAgentId, setOptimisticAgentId] =
    useOptimistic(selectedAgentId);

  const options = useMemo(
    () =>
      chatAgents.map((chatAgent) => ({
        value: chatAgent.id,
        label: chatAgent.name,
      })),
    [],
  );

  return (
    <ChipToggle
      options={options}
      defaultValue={optimisticAgentId || 'all'}
      onValueChange={(value) => {
        console.log(value);
        setOptimisticAgentId(value);
        if (onAgentChange) {
          onAgentChange(value);
        }
      }}
    />
  );
}
