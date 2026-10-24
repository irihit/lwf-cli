/**
 * Configuration loader and validator for lwf.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  LwfConfig,
  LwfRawConfig,
  LwfConfigExport,
  LwfConfigFn,
  LwfFunctionUrlInput,
  LwfResolvedLambdaConfig,
  LwfResolvedFunctionUrlConfig,
  LwfCloudFrontConfig,
  LwfSubdomainRoutingConfig,
  LwfResolvedCodeMapping,
} from './types.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const DEFAULT_EXCLUDES = [
  '.git',
  '.env*',
  '.lwf',
  'lwf.config.*',
  'node_modules/.cache',
];

export const CONFIG_CANDIDATES = [
  'lwf.config.ts',
  'lwf.config.js',
  'lwf.config.mjs',
  'lwf.config.json',
];

/**
 * Helper function providing type completion for lwf configuration.
 */
export function defineConfig(config: LwfRawConfig): LwfRawConfig;
export function defineConfig(config: Promise<LwfRawConfig>): Promise<LwfRawConfig>;
export function defineConfig(config: LwfConfigFn): LwfConfigFn;
export function defineConfig(config: LwfConfigExport): LwfConfigExport {
  return config;
}

function getLwfEntryUrl(): string {
  const distEntry = path.resolve(import.meta.dirname, 'index.js');
  if (fs.existsSync(distEntry)) {
    return pathToFileURL(distEntry).href;
  }
  const tsEntry = path.resolve(import.meta.dirname, 'index.ts');
  if (fs.existsSync(tsEntry)) {
    return pathToFileURL(tsEntry).href;
  }
  return pathToFileURL(distEntry).href;
}

/**
 * Find and dynamically load configuration file (.ts, .js, .mjs, or .json).
 */
export async function loadRawConfig(
  filePath?: string
): Promise<{ raw: LwfRawConfig; resolvedPath: string }> {
  let foundPath: string | null = null;

  if (filePath) {
    const p = path.resolve(filePath);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      foundPath = p;
    } else {
      throw new ConfigError(`Specified configuration file '${filePath}' not found.`);
    }
  } else {
    for (const cand of CONFIG_CANDIDATES) {
      const p = path.resolve(cand);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        foundPath = p;
        break;
      }
    }
  }

  if (!foundPath) {
    if (filePath) {
      throw new ConfigError(`Specified configuration file '${filePath}' not found.`);
    }
    return { raw: {}, resolvedPath: path.resolve('lwf.config.ts') };
  }

  if (foundPath.endsWith('.yaml') || foundPath.endsWith('.yml')) {
    throw new ConfigError(
      `YAML configuration files are no longer supported (${path.basename(foundPath)}). Please migrate to 'lwf.config.ts'.`
    );
  }

  if (foundPath.endsWith('.json')) {
    try {
      const content = fs.readFileSync(foundPath, 'utf-8');
      return { raw: JSON.parse(content) as LwfRawConfig, resolvedPath: foundPath };
    } catch (err: any) {
      throw new ConfigError(`JSON syntax error in '${foundPath}': ${err.message}`);
    }
  }

  // Load TypeScript / JavaScript module
  try {
    const fileUrl = `${pathToFileURL(foundPath).href}?t=${Date.now()}`;
    let mod: any;
    try {
      mod = await import(fileUrl);
    } catch (err: any) {
      // If native dynamic import failed (e.g. missing 'lwf' package or need TS transpile):
      const source = fs.readFileSync(foundPath, 'utf-8');
      const lwfUrl = getLwfEntryUrl();
      let transformed = source.replace(/(['"])(?:lwf|lwf-cli)\1/g, `"${lwfUrl}"`);

      if (foundPath.endsWith('.ts') || foundPath.endsWith('.mts')) {
        try {
          const ts = await import('typescript');
          const transpile = (ts as any).default?.transpileModule ?? (ts as any).transpileModule;
          const ModuleKind = (ts as any).default?.ModuleKind ?? (ts as any).ModuleKind;
          const ScriptTarget = (ts as any).default?.ScriptTarget ?? (ts as any).ScriptTarget;
          const transpiled = transpile(transformed, {
            compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ESNext },
          });
          transformed = transpiled.outputText;
        } catch {
          // If typescript is not available, we keep transformed as is
        }
      }

      try {
        const base64 = Buffer.from(transformed).toString('base64');
        mod = await import(`data:text/javascript;base64,${base64}`);
      } catch (innerErr) {
        throw err;
      }
    }

    let raw = mod.default ?? mod.config ?? mod;
    if (typeof raw === 'function') {
      raw = await raw();
    }
    if (raw && typeof raw === 'object' && 'default' in raw && Object.keys(raw).length === 1) {
      raw = raw.default;
    }
    return { raw: (raw || {}) as LwfRawConfig, resolvedPath: foundPath };
  } catch (err: any) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`Failed to load configuration file '${foundPath}': ${err.message || err}`);
  }
}

export interface ConfigOverrides {
  subdomain?: string;
}

export function interpolate(str: string, vars: Record<string, string>): string {
  return str.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, key) => vars[key] ?? process.env[key] ?? '');
}

/**
 * Validate and produce fully-resolved LwfConfig.
 */
export async function loadConfig(filePath?: string, overrides?: ConfigOverrides): Promise<LwfConfig> {
  const { raw, resolvedPath } = await loadRawConfig(filePath);
  const rootDir = path.dirname(resolvedPath);

  // Resolve subdomain identifier for preview/isolated routing
  let rawSub = overrides?.subdomain;
  if (!rawSub) {
    rawSub =
      process.env.SUBDOMAIN ||
      process.env.LWF_SUBDOMAIN ||
      process.env.PR_NUMBER ||
      process.env.GITHUB_PR_NUMBER ||
      '';
  }
  const subdomain = String(rawSub || '');

  const vars: Record<string, string> = {
    SUBDOMAIN: subdomain,
    PR_NUMBER: subdomain,
  };

  // 1. AWS Lambda Function Configuration (wrapping CreateFunctionCommandInput)
  const rawLambda = raw.Lambda || raw.lambda || {};
  const defaultName = path.basename(rootDir).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const rawName = rawLambda.FunctionName || raw.Name || raw.name || defaultName;
  let name = interpolate(String(rawName), vars);

  // If subdomain is specified, ensure function name includes -${subdomain} suffix
  if (subdomain && !name.endsWith(`-${subdomain}`)) {
    name = `${name}-${subdomain}`;
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
    throw new ConfigError(
      `Function name '${name}' is invalid. Use alphanumeric characters, hyphens, and underscores.`
    );
  }

  // 2. AWS Lambda Function Specs
  const runtime = String(rawLambda.Runtime || 'nodejs24.x');
  const archStr = rawLambda.Architectures?.[0];
  const architecture = (archStr === 'x86_64' ? 'x86_64' : 'arm64') as 'arm64' | 'x86_64';
  const architectures: ('arm64' | 'x86_64')[] = [architecture];

  const memory = Number(rawLambda.MemorySize ?? 512);
  const timeout = Number(rawLambda.Timeout ?? 30);
  const handler = String(rawLambda.Handler || 'index.handler');

  if (isNaN(memory) || memory < 128 || memory > 10240) {
    throw new ConfigError(`MemorySize must be between 128 and 10240 MB (got ${rawLambda.MemorySize}).`);
  }
  if (isNaN(timeout) || timeout < 1 || timeout > 900) {
    throw new ConfigError(`Timeout must be between 1 and 900 seconds (got ${rawLambda.Timeout}).`);
  }

  // Environment variables
  const env: Record<string, string> = {};
  if (rawLambda.Environment?.Variables && typeof rawLambda.Environment.Variables === 'object') {
    for (const [k, v] of Object.entries(rawLambda.Environment.Variables)) {
      env[String(k)] = interpolate(String(v), vars);
    }
  }

  const resolvedLambda: LwfResolvedLambdaConfig = {
    ...rawLambda,
    FunctionName: name,
    Runtime: runtime,
    Architectures: architectures,
    MemorySize: memory,
    Timeout: timeout,
    Handler: handler,
    Environment: {
      Variables: env,
    },
  };

  // 3. Code Directory / Mappings
  const rawCode = raw.Code ?? raw.code ?? '.';
  const codeMappings: LwfResolvedCodeMapping[] = [];
  const codeLabels: string[] = [];

  const rawEntries = Array.isArray(rawCode) ? rawCode : [rawCode];

  for (const item of rawEntries) {
    if (!item) continue;

    let srcStr: string;
    let destStr: string;

    if (typeof item === 'string') {
      srcStr = item;
      // If single string (e.g. Code: 'dist' or Code: '.'), dest is '.'
      if (!Array.isArray(rawCode)) {
        destStr = '.';
      } else {
        // If array of strings (e.g. ['dist', 'node_modules', 'package.json']),
        // dest defaults to item (so 'dist' -> 'dist', 'node_modules' -> 'node_modules')
        destStr = item;
      }
    } else if (typeof item === 'object' && item.src) {
      srcStr = String(item.src);
      destStr = item.dest !== undefined ? String(item.dest) : item.src;
    } else {
      throw new ConfigError(`Invalid Code entry: ${JSON.stringify(item)}`);
    }

    srcStr = interpolate(srcStr, vars);
    destStr = interpolate(destStr, vars);

    const resolvedSrc = path.resolve(rootDir, srcStr);
    if (!fs.existsSync(resolvedSrc)) {
      throw new ConfigError(`Code path '${srcStr}' (${resolvedSrc}) does not exist.`);
    }

    // Clean destination path (normalize slashes)
    let cleanDest = destStr.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanDest || cleanDest === '.') {
      cleanDest = '.';
    }

    codeMappings.push({
      src: resolvedSrc,
      dest: cleanDest,
    });

    const label = cleanDest !== '.' && cleanDest !== srcStr
      ? `${srcStr} -> ${cleanDest}`
      : (cleanDest === '.' && srcStr !== '.' ? `${srcStr} (-> .)` : srcStr);
    codeLabels.push(label);
  }

  if (codeMappings.length === 0) {
    throw new ConfigError('No valid Code entries specified.');
  }

  const codeDir = codeLabels.join(', ');

  // 4. Regions
  const rawRegions = raw.Regions ?? raw.regions;
  let regions: string[] = [];
  if (Array.isArray(rawRegions) && rawRegions.length > 0) {
    regions = rawRegions.map(String);
  } else if (typeof rawRegions === 'string' && rawRegions.trim()) {
    regions = [rawRegions.trim()];
  } else {
    const defaultRegion =
      process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-1';
    regions = [defaultRegion];
  }

  // 6. CloudFront (Optional attachment & Subdomain Routing)
  let cloudfront: LwfCloudFrontConfig | undefined = undefined;
  const rawCf = raw.CloudFront || raw.cloudfront;
  if (rawCf && typeof rawCf === 'object') {
    let arns: string[] = [];
    const singleArn =
      rawCf.DistributionArn ||
      rawCf.DistributionId ||
      rawCf.distributionArn ||
      rawCf.distributionId ||
      rawCf.distribution_arn;
    if (singleArn) {
      arns.push(String(singleArn));
    }
    const multiArns =
      rawCf.DistributionArns ||
      rawCf.DistributionIds ||
      rawCf.distributionArns ||
      rawCf.distributionIds ||
      rawCf.distribution_arns;
    if (Array.isArray(multiArns)) {
      arns.push(...multiArns.map(String));
    }
    arns = arns.filter(Boolean);

    if (arns.length > 0) {
      const normalizedArns = arns.map((arn) => {
        if (!arn.startsWith('arn:aws:cloudfront:')) {
          return `arn:aws:cloudfront:::distribution/${arn}`;
        }
        return arn;
      });

      let subdomainRouting: LwfSubdomainRoutingConfig | undefined = undefined;
      const subConfig =
        rawCf.SubdomainRouting ||
        rawCf.subdomainRouting ||
        rawCf.subdomain_routing;
      if (
        subConfig &&
        (subConfig === true ||
          (typeof subConfig === 'object' &&
            subConfig.Enabled !== false &&
            subConfig.enabled !== false) ||
          overrides?.subdomain)
      ) {
        const rawDomain =
          typeof subConfig === 'object'
            ? subConfig.Domain || subConfig.domain
            : undefined;
        const domain = rawDomain ? interpolate(String(rawDomain), vars) : undefined;
        const resolvedSub = subdomain || 'preview';
        let previewUrl: string | undefined = undefined;
        if (domain) {
          const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
          previewUrl = `https://${resolvedSub}.${cleanDomain}`;
        }

        subdomainRouting = {
          enabled: true,
          domain,
          subdomain: resolvedSub,
          previewUrl,
          Domain: domain,
          Subdomain: resolvedSub,
          PreviewUrl: previewUrl,
        };
      }

      const oacSetting =
        rawCf.OAC ??
        rawCf.OriginAccessControl ??
        rawCf.Oac ??
        rawCf.oac;

      const isOacEnabled = oacSetting !== false; // default true

      cloudfront = {
        distributionArns: normalizedArns,
        oac: isOacEnabled,
        subdomainRouting,
        DistributionArns: normalizedArns,
        OAC: isOacEnabled,
        SubdomainRouting: subdomainRouting,
      };
    }
  }

  // 7. Function URL Configuration (wrapping CreateFunctionUrlConfigCommandInput)
  const rawUrl: LwfFunctionUrlInput = raw.FunctionUrl || raw.functionUrl || {};
  const useCloudFrontOac = cloudfront?.oac ?? false;
  let authType: 'NONE' | 'AWS_IAM' = useCloudFrontOac ? 'AWS_IAM' : 'NONE';
  if (rawUrl.AuthType) {
    authType = rawUrl.AuthType === 'AWS_IAM' ? 'AWS_IAM' : 'NONE';
  }

  const cors = rawUrl.Cors || {};
  const corsOrigins = cors.AllowOrigins || ['*'];
  const corsMethods = cors.AllowMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'];
  const corsHeaders = cors.AllowHeaders || ['*'];

  const resolvedFunctionUrl: LwfResolvedFunctionUrlConfig = {
    ...rawUrl,
    AuthType: authType,
    Cors: {
      ...cors,
      AllowOrigins: corsOrigins,
      AllowMethods: corsMethods,
      AllowHeaders: corsHeaders,
    },
    InvokeMode: rawUrl.InvokeMode || 'BUFFERED',
  };

  // 8. Excludes
  const rawEx = raw.Exclude ?? raw.exclude ?? raw.Excludes ?? raw.excludes;
  const userExcludes = Array.isArray(rawEx) ? rawEx.map(String) : [];
  const excludes = Array.from(new Set([...DEFAULT_EXCLUDES, ...userExcludes]));

  return {
    // PascalCase properties
    Name: name,
    Subdomain: subdomain || undefined,
    Code: codeMappings,
    CodeDir: codeDir,
    RootDir: rootDir,
    ConfigPath: resolvedPath,
    Regions: regions,
    Lambda: resolvedLambda,
    FunctionUrl: resolvedFunctionUrl,
    CloudFront: cloudfront,
    Exclude: excludes,
    Excludes: excludes,

    // Compatibility aliases
    name,
    subdomain: subdomain || undefined,
    code: codeMappings,
    codeDir,
    rootDir,
    configPath: resolvedPath,
    regions,
    lambda: resolvedLambda,
    functionUrl: resolvedFunctionUrl,
    cloudfront,
    excludes,

    // Convenience accessors
    runtime,
    architecture,
    memory,
    timeout,
    concurrency: 64,
    auth: authType === 'AWS_IAM' ? 'iam' : 'none',
    corsOrigins,
    corsMethods,
    corsHeaders,
    env,
  };
}
