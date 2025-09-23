import { VibkitError } from 'arbitrum-vibekit-core';

let paraModulePromise:
  | Promise<typeof import('@getpara/server-sdk')>
  | undefined;

export async function loadParaModule(): Promise<typeof import('@getpara/server-sdk')> {
  if (!paraModulePromise) {
    paraModulePromise = import('@getpara/server-sdk').catch((error: unknown) => {
      paraModulePromise = undefined;
      throw new VibkitError(
        'ParaSdkNotAvailable',
        -32001,
        `Failed to load @getpara/server-sdk. Install the package in the quickstart-agent workspace and ensure network access. Original error: ${(error as Error).message}`,
      );
    });
  }
  return paraModulePromise;
}

export async function getParaServerClient() {
  const apiKey = process.env.PARA_API_KEY;
  if (!apiKey) {
    throw new VibkitError('MissingParaApiKey', -32602, 'PARA_API_KEY environment variable is required');
  }

  const module = await loadParaModule();
  const { Para: ParaServer, Environment } = module;

  const envSetting = process.env.PARA_ENVIRONMENT?.toUpperCase() ?? 'BETA';
  const environment = (Environment as Record<string, (typeof Environment)[keyof typeof Environment]>)[envSetting] ?? Environment.BETA;

  return new ParaServer(environment, apiKey, { disableWebSockets: true });
}
