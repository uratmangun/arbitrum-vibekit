import { encodeFunctionData } from 'viem';
import { sepolia } from 'viem/chains';
import { PinataSDK } from 'pinata';
import { IDENTITY_REGISTRY_ABI } from '../abi/identity.js';
import { serveTransactionSigningPage, openBrowser } from '../utils/serve-transaction.js';

/**
 * Options for registering an agent.
 */
export type RegisterOptions = {
  agentName: string;
  agentDescription: string;
  agentUrl: string;
  chainId: string;
  agentVersion?: string;
  agentImage?: string;
};

/**
 * Contract addresses for supported chains.
 */
export const CONTRACT_ADDRESSES = {
  [sepolia.id]: {
    identity: '0x8004a6090Cd10A7288092483047B097295Fb8847',
  },
} as const;

/**
 * Command to register an agent using EIP-8004 standard.
 * @param options
 */
export async function registerAgentUsing8004(options: RegisterOptions) {
  const chainId = parseInt(options.chainId);
  if (!isSupportedChain(chainId)) {
    throw new Error(`Unsupported chain ID: ${options.chainId}`);
  }

  const registrationFileContents = buildRegistrationFile(
    options.agentName,
    options.agentDescription,
    options.agentImage || 'https://example.com/agent-image.png',
    options.agentVersion || '1.0.0',
    options.agentUrl,
    chainId,
  );
  const ipfsUri = await createIpfsFile(registrationFileContents);

  const callData = encodeFunctionData({
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [ipfsUri],
  });

  // Serve the transaction signing page
  const url = await serveTransactionSigningPage({
    to: CONTRACT_ADDRESSES[chainId].identity,
    data: callData,
    chainId,
    agentName: options.agentName,
  });

  console.log('\n✅ Registration file uploaded to IPFS:', ipfsUri);
  console.log('\n🌐 Opening browser to sign transaction...');
  console.log('📋 Transaction URL:', url);

  try {
    await openBrowser(url);
    console.log('\n✨ Please complete the transaction in your browser.');
    console.log('   Press Ctrl+C to close the server when done.\n');
  } catch (error) {
    console.log('\n⚠️  Could not open browser automatically.');
    console.log('   Please open this URL manually:', url);
    console.log('   Press Ctrl+C to close the server when done.\n');
  }

  // Keep the process alive so the server stays running
  return new Promise(() => {
    // This promise never resolves, keeping the server alive
    // User will need to manually terminate with Ctrl+C
  });
}

/**
 * Type representing supported chain IDs.
 */
export type SupportedChains = keyof typeof CONTRACT_ADDRESSES;

/**
 * Checks if the given chain ID is supported.
 * @param chainId The chain ID to check.
 * @returns True if the chain ID is supported, false otherwise.
 */
export function isSupportedChain(chainId: number): chainId is SupportedChains {
  return chainId in CONTRACT_ADDRESSES;
}

/**
 * Builds the registration file for the agent.
 * @param agentName The name of the agent.
 * @param agentDescription A description of the agent.
 * @param agentImage The image URL of the agent.
 * @param agentVersion The version of the agent.
 * @param agentUrl The URL of the agent.
 * @returns The registration file object.
 */
function buildRegistrationFile(
  agentName: string,
  agentDescription: string,
  agentImage: string,
  agentVersion: string,
  agentUrl: string,
  chainId: SupportedChains,
) {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agentName,
    description: agentDescription,
    image: agentImage,
    endpoints: [
      {
        name: 'A2A',
        endpoint: `${agentUrl}/.well-known/agent-card.json`,
        version: agentVersion,
      },
    ],
    registrations: [
      {
        agentId: 22,
        agentRegistry: `eip155:${chainId}:${CONTRACT_ADDRESSES[chainId].identity}`,
      },
    ],
    supportedTrust: [],
  };
}

/**
 * Uploads the given file contents to IPFS and returns the URI.
 * @param fileContents The contents of the file to upload.
 * @returns The IPFS URI of the uploaded file.
 */
async function createIpfsFile(fileContents: unknown): Promise<string> {
  const pinataJwt = process.env['PINATA_JWT'];
  const pinataGateway = process.env['PINATA_GATEWAY'];

  if (!pinataJwt) {
    throw new Error('PINATA_JWT environment variable is not set');
  }
  if (!pinataGateway) {
    throw new Error('PINATA_GATEWAY environment variable is not set');
  }

  const pinataClient = new PinataSDK({ pinataJwt });

  // Upload JSON to IPFS using Pinata
  const file = new File([JSON.stringify(fileContents)], 'registration.json', {
    type: 'application/json',
  });
  const upload = await pinataClient.upload.public.file(file);

  // Return the IPFS URI
  return `ipfs://${upload.cid}`;
}

/**
 * CLI command options for registering an agent.
 */
export type RegisterCommandOptions = {
  name?: string;
  description?: string;
  url?: string;
  chainId?: string;
  version?: string;
  image?: string;
};

/**
 * CLI wrapper for the register command.
 * @param options Command line options
 */
export async function registerCommand(options: RegisterCommandOptions): Promise<void> {
  // Validate required options
  if (!options.name) {
    throw new Error('Agent name is required. Use --name <agent-name>');
  }
  if (!options.description) {
    throw new Error('Agent description is required. Use --description <description>');
  }
  if (!options.url) {
    throw new Error('Agent URL is required. Use --url <agent-url>');
  }
  if (!options.chainId) {
    throw new Error('Chain ID is required. Use --chain-id <chain-id>');
  }

  console.log('\n🤖 Registering agent...');
  console.log('Name:', options.name);
  console.log('Description:', options.description);
  console.log('URL:', options.url);
  console.log('Chain ID:', options.chainId);
  if (options.version) {
    console.log('Version:', options.version);
  }
  if (options.image) {
    console.log('Image:', options.image);
  }

  await registerAgentUsing8004({
    agentName: options.name,
    agentDescription: options.description,
    agentUrl: options.url,
    chainId: options.chainId,
    agentVersion: options.version,
    agentImage: options.image,
  });
}
