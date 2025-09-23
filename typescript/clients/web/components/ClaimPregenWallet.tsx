'use client';

import { useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { Button } from './ui/button';
import type { UIMessage } from 'ai';
import { generateUUID } from '@/lib/utils';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { usePathname } from 'next/navigation';

type ClaimPregenWalletProps = {
  result?: any;
};

export function ClaimPregenWallet({ result }: ClaimPregenWalletProps) {
  // The `result` here is the MCP envelope: { status, result: { content: [{ text: string }] } }
  // We need to extract the text and parse into the Task -> artifacts -> parts[0] -> data payload
  const text: string | undefined =
    result?.result?.content?.[0]?.text ?? result?.result?.content?.[0]?.resource?.text;

  let task: any = null;
  if (typeof text === 'string') {
    try {
      task = JSON.parse(text);
    } catch {
      task = null;
    }
  }

  // Try to extract the payload from the first artifact/part
  const firstPart = task?.artifacts?.[0]?.parts?.[0];
  let payload: any = firstPart?.data ?? null;
  if (!payload && typeof firstPart?.text === 'string') {
    try {
      payload = JSON.parse(firstPart.text);
    } catch {
      // leave payload as null
    }
  }

  const identifierKey: string | undefined = payload?.identifierKey ?? task?.identifierKey;
  const identifierValue: string | undefined = payload?.identifierValue ?? task?.identifierValue;
  const userShare: unknown = payload?.userShare ?? task?.userShare;

  const [isClaiming, setIsClaiming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { openConnectModal } = useConnectModal();
  const { isConnected, address } = useAccount();
  const pathname = usePathname();
  const chatId = (() => {
    try {
      const last = pathname?.split('/').filter(Boolean).pop();
      return last || '';
    } catch {
      return '';
    }
  })();
  const selectedChatModel = DEFAULT_CHAT_MODEL;

  async function handleClaim() {
    setError(null);
    setStatus(null);
    if (!identifierKey || !identifierValue) {
      setError('Missing identifier information.');
      return;
    }
    if (userShare == null || userShare === 'Unavailable - wallet already existed before caching') {
      setError('User share unavailable. Please recreate the pregenerated wallet to obtain a user share.');
      return;
    }

    try {
      setIsClaiming(true);
      setStatus('Preparing claim...');

      if (!isConnected && openConnectModal) {
        openConnectModal();
        setStatus('Please connect with Para in the wallet modal, then click Claim again.');
        setIsClaiming(false);
        return;
      }

      setStatus('Loading Para SDK...');
      const mod: any = await import('@getpara/web-sdk');
      const Env = mod.Environment || mod.default?.Environment;
      const ParaCtor = mod.Para || mod.ParaWeb || mod.default?.Para || mod.default?.ParaWeb;
      const apiKey = process.env.NEXT_PUBLIC_PARA_API_KEY || '';
      if (!ParaCtor || !Env || !apiKey) {
        throw new Error('Para Web SDK or API key is not available.');
      }

      const para = new ParaCtor(Env.BETA, apiKey);

      setStatus('Setting user share...');
      let parsedShare: any = userShare;
      if (typeof parsedShare === 'string') {
        try {
          parsedShare = JSON.parse(parsedShare);
        } catch {
          // keep as string
        }
      }
      if (typeof para.setUserShare !== 'function') throw new Error('para.setUserShare not available');
      await para.setUserShare(parsedShare);

      setStatus('Claiming pregenerated wallet...');
      if (typeof para.claimPregenWallets !== 'function') throw new Error('para.claimPregenWallets not available');
      const secret: string | undefined = await para.claimPregenWallets({
        pregenIdentifier: identifierValue,
        pregenIdentifierType: String(identifierKey).toUpperCase(),
      });

      setStatus('Submitting background request to mark as claimed...');
      const args = {
        identifier: identifierValue,
        identifierType: identifierKey,
        recoverySecret: secret ?? undefined,
      };
      const content = `mark pregenerated wallet as claimed\nUse tool: para-wallet-mark_pregen_wallet_claimed\nArgs: ${JSON.stringify(args)}`;
      // Fire-and-forget: directly POST to /api/chat without updating UI stream
      const userMessage: UIMessage = {
        id: generateUUID(),
        role: 'user',
        content,
        parts: [{ type: 'text', text: content }] as UIMessage['parts'],
        experimental_attachments: [],
      };
      // Do not await the fetch; let the server process in background
      void fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          id: chatId,
          messages: [userMessage],
          selectedChatModel,
          context: { walletAddress: address || '' },
        }),
      }).catch((e) => {
        console.warn('Background chat POST failed', e);
      });

      setStatus('Request submitted. The wallet will be marked as claimed shortly.');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-4 text-sm">
      <div className="font-medium mb-2">Pregenerated wallet claim</div>
      {identifierKey || identifierValue ? (
        <div className="space-y-2">
          <div>
            <span className="text-slate-500">Identifier: </span>
            <span className="font-mono">
              {identifierKey ?? 'unknown'} ({identifierValue ?? 'unknown'})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={isClaiming} onClick={handleClaim}>
              {isClaiming ? 'Claiming...' : 'Claim with Para'}
            </Button>
            {status && <span className="text-slate-600 text-xs">{status}</span>}
          </div>
          {error && <div className="text-red-600 text-xs">{error}</div>}
        </div>
      ) : (
        <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">
          {typeof text === 'string' ? text : JSON.stringify(result ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}

