'use client';
import '@getpara/react-sdk/styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import { darkTheme, RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  rainbowWallet,
  metaMaskWallet,
  walletConnectWallet,
  baseAccount,
} from '@rainbow-me/rainbowkit/wallets';
import {
  cookieStorage,
  cookieToInitialState,
  createStorage,
  createConfig,
  http,
  WagmiProvider
  WagmiProvider
} from 'wagmi';
import { mainnet, arbitrum } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { RainbowKitSiweNextAuthProvider } from '@rainbow-me/rainbowkit-siwe-next-auth';
import { paraConnector } from '@getpara/wagmi-v2-integration';
import Para from '@getpara/web-sdk';

function WagmiConfig({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}) {
  // Initialize Para SDK
  const para = useMemo(() => new Para(process.env.NEXT_PUBLIC_PARA_API_KEY || ''), []);

  // Create Para connector
  const paraWagmiConnector = useMemo(
    () =>
      paraConnector({
        para,
        chains: [arbitrum, mainnet],
        appName: 'Arbitrum VibeKit',
        options: {},
        queryClient,
        oAuthMethods: [], // Empty array disables all OAuth methods (Google, X, etc.)
        disablePhoneLogin: true, // Disable phone login, only allow email
      }),
    [para, queryClient],
  );

  // Create RainbowKit wallet connectors for popular wallets
  const rainbowKitConnectors = connectorsForWallets(
    [
      {
        groupName: 'Popular',
        wallets: [rainbowWallet, metaMaskWallet, baseAccount, walletConnectWallet],
      },
    ],
    {
      appName: 'Arbitrum VibeKit',
      projectId: '4b49e5e63b9f6253943b470873b47208',
    },
  );

  const config = useMemo(
    () =>
      createConfig({
        chains: [arbitrum, mainnet],
        ssr: true,
        storage: createStorage({ storage: cookieStorage }),
        transports: {
          [arbitrum.id]: http(
            process.env.NEXT_PUBLIC_RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
          ),
          [mainnet.id]: http(
            process.env.NEXT_PUBLIC_RPC_MAINNET || 'https://ethereum-rpc.publicnode.com',
          ),
        },
        connectors: [
          // Para social login
          paraWagmiConnector as any,
          // RainbowKit popular wallets (includes Base Account SDK)
          ...rainbowKitConnectors,
        ],
      }),
    [paraWagmiConnector, rainbowKitConnectors],
  );

  const cookie = cookieStorage.getItem('wagmi.storage') || '';
  const initialState = cookieToInitialState(config, cookie);

  return (
    <WagmiProvider
      config={config}
      reconnectOnMount={true}
      initialState={initialState}
    >
      <RainbowKitSiweNextAuthProvider>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#4E76A9',
            accentColorForeground: '#fff',
          })}
          initialChain={arbitrum}
        >
          {children}
        </RainbowKitProvider>
      </RainbowKitSiweNextAuthProvider>
    </WagmiProvider>
  );
}

export function ProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiConfig queryClient={queryClient}>{children}</WagmiConfig>
    </QueryClientProvider>
  );
}
