/**
 * Environment Variable Resolver
 * Resolves $env:VAR_NAME references in configuration
 */

const ENV_REF_PATTERN = /^\$env:([A-Z_][A-Z0-9_]*)$/;

export interface EnvResolverOptions {
  required?: boolean;
  redact?: boolean;
}

export class EnvResolutionError extends Error {
  constructor(
    public envVar: string,
    message: string,
  ) {
    super(message);
    this.name = 'EnvResolutionError';
  }
}

/**
 * Resolve a single environment variable reference
 * @param ref - Reference string (e.g., "$env:API_KEY")
 * @param options - Resolution options
 * @returns Resolved value or original ref if not a reference
 */
export function resolveEnvRef(ref: string, options: EnvResolverOptions = {}): string {
  const match = ENV_REF_PATTERN.exec(ref);
  if (!match || !match[1]) {
    return ref;
  }

  const varName = match[1];
  const value = process.env[varName];

  if (value === undefined) {
    if (options.required !== false) {
      throw new EnvResolutionError(
        varName,
        `Required environment variable ${varName} is not defined. ` +
          `Please add it to your .env file.`,
      );
    }
    return ref;
  }

  return value;
}

/**
 * Resolve all environment references in an object recursively
 * @param obj - Object to resolve
 * @param options - Resolution options
 * @returns Object with resolved values
 */
export function resolveEnvRefs<T>(obj: T, options: EnvResolverOptions = {}): T {
  if (typeof obj === 'string') {
    return resolveEnvRef(obj, options) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvRefs(item, options)) as T;
  }

  if (obj && typeof obj === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvRefs(value, options);
    }
    return resolved as T;
  }

  return obj;
}

/**
 * Redact environment variable values for logging
 * @param obj - Object to redact
 * @returns Object with redacted values
 */
export function redactEnvRefs<T>(obj: T): T {
  if (typeof obj === 'string') {
    if (ENV_REF_PATTERN.test(obj)) {
      return '***REDACTED***' as T;
    }
    // Redact resolved values that look like secrets (keys, tokens, etc.)
    if (
      obj.length > 20 &&
      (obj.includes('key') || obj.includes('token') || obj.includes('secret'))
    ) {
      return '***REDACTED***' as T;
    }
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactEnvRefs(item)) as T;
  }

  if (obj && typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact known secret fields
      if (
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('key')
      ) {
        redacted[key] = '***REDACTED***';
      } else {
        redacted[key] = redactEnvRefs(value);
      }
    }
    return redacted as T;
  }

  return obj;
}

/**
 * Validate that environment variables are defined
 * @param envVars - Array of variable names to validate
 */
export function validateEnvVars(envVars: string[]): void {
  const missing = envVars.filter((varName) => process.env[varName] === undefined);

  if (missing.length > 0) {
    throw new EnvResolutionError(
      missing[0] ?? '',
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Please add them to your .env file.`,
    );
  }
}

/**
 * Extract environment variable references from an object
 * @param obj - Object to scan
 * @returns Array of environment variable names
 */
export function extractEnvRefs(obj: unknown): string[] {
  const refs = new Set<string>();

  function scan(value: unknown): void {
    if (typeof value === 'string') {
      const match = ENV_REF_PATTERN.exec(value);
      if (match && match[1]) {
        refs.add(match[1]);
      }
    } else if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(scan);
    }
  }

  scan(obj);
  return Array.from(refs);
}
