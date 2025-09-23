'use client';

import { Button } from './ui/button';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface ToolApprovalProps {
  toolName: string;
  toolCallId: string;
  approvalId: string;
  input: Record<string, unknown>;
  onApprove: (approvalId: string, toolCallId: string) => void;
  onDeny: (approvalId: string, toolCallId: string) => void;
}

export const ToolApproval = ({
  toolName,
  toolCallId,
  approvalId,
  input,
  onApprove,
  onDeny,
}: ToolApprovalProps) => {
  const [status, setStatus] = useState<'pending' | 'approved' | 'denied'>('pending');

  const handleApprove = () => {
    console.log('[ToolApproval] Approve button clicked!', { approvalId, toolCallId, toolName });
    setStatus('approved');
    console.log('[ToolApproval] Calling onApprove handler...');
    onApprove(approvalId, toolCallId);
    console.log('[ToolApproval] onApprove handler called');
  };

  const handleDeny = () => {
    console.log('[ToolApproval] Deny button clicked!', { approvalId, toolCallId, toolName });
    setStatus('denied');
    console.log('[ToolApproval] Calling onDeny handler...');
    onDeny(approvalId, toolCallId);
    console.log('[ToolApproval] onDeny handler called');
  };

  return (
    <div className="flex flex-col gap-3 p-4 border-2 border-yellow-500 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 my-2">
      <div className="flex items-start gap-3">
        <AlertCircle className="size-5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
            Tool Approval Required
          </h4>
          <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
            The AI wants to execute the tool: <span className="font-mono font-semibold">{toolName}</span>
          </p>

          {/* Display tool input parameters */}
          {Object.keys(input).length > 0 && (
            <div className="mb-3 p-3 bg-white dark:bg-gray-900 rounded border border-yellow-300 dark:border-yellow-700">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Parameters:</p>
              <pre className="text-xs text-gray-800 dark:text-gray-200 overflow-x-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}

          {/* Action buttons */}
          {status === 'pending' && (
            <div className="flex gap-2">
              <Button
                onClick={handleApprove}
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="size-4 mr-1" />
                Approve
              </Button>
              <Button
                onClick={handleDeny}
                size="sm"
                variant="destructive"
              >
                <XCircle className="size-4 mr-1" />
                Deny
              </Button>
            </div>
          )}

          {/* Status display after action */}
          {status === 'approved' && (
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" />
              <span className="text-sm font-medium">Approved - Executing tool...</span>
            </div>
          )}

          {status === 'denied' && (
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <XCircle className="size-4" />
              <span className="text-sm font-medium">Denied - Tool execution cancelled</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
