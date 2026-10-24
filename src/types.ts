/**
 * Type definitions for lwf.
 */

import type {
  CreateFunctionCommandInput,
  CreateFunctionUrlConfigCommandInput,
  Cors,
  Runtime,
} from '@aws-sdk/client-lambda';

export type LwfLambdaFunctionInput = Omit<
  CreateFunctionCommandInput,
  'Code' | 'Role' | 'FunctionName'
> & {
  FunctionName?: string;
  Role?: string;
};

export type LwfFunctionUrlInput = Partial<Omit<CreateFunctionUrlConfigCommandInput, 'FunctionName'>>;

export interface LwfSubdomainRoutingInput {
  Domain?: string; // Base domain, e.g. "preview.example.com"
  Enabled?: boolean;

  // Compatibility aliases
  domain?: string;
  enabled?: boolean;
}

export interface LwfSubdomainRoutingConfig {
  enabled: boolean;
  domain?: string;
  subdomain: string; // Active resolved subdomain (e.g. "42", "feat-login", "staging")
  previewUrl?: string; // e.g. "https://42.preview.example.com"

  // PascalCase aliases
  Domain?: string;
  Subdomain: string;
  PreviewUrl?: string;
}

export interface LwfCloudFrontConfigInput {
  // Primary PascalCase keys matching AWS SDK conventions across lambda and functionUrl
  DistributionArn?: string;
  DistributionArns?: string[];
  DistributionId?: string;
  DistributionIds?: string[];
  OAC?: boolean;
  Oac?: boolean;
  OriginAccessControl?: boolean;
  SubdomainRouting?: boolean | LwfSubdomainRoutingInput;

  // Compatibility aliases
  distributionArn?: string;
  distributionArns?: string[];
  distributionId?: string;
  distributionIds?: string[];
  distribution_arn?: string;
  distribution_arns?: string[];
  oac?: boolean;
  subdomainRouting?: boolean | LwfSubdomainRoutingInput;
  subdomain_routing?: boolean | LwfSubdomainRoutingInput;
}

export interface LwfCloudFrontConfig {
  distributionArns: string[];
  oac: boolean;
  subdomainRouting?: LwfSubdomainRoutingConfig;

  // PascalCase aliases
  DistributionArns: string[];
  OAC: boolean;
  SubdomainRouting?: LwfSubdomainRoutingConfig;
}

export interface LwfCodeMapping {
  src: string;
  dest?: string;
}

export type LwfCodeEntry = string | LwfCodeMapping;
export type LwfCodeInput = string | LwfCodeEntry[];

export interface LwfResolvedCodeMapping {
  src: string;
  dest: string;
}

export interface LwfRawConfig {
  // Primary PascalCase keys matching AWS SDK conventions across configuration
  Lambda?: LwfLambdaFunctionInput;
  FunctionUrl?: LwfFunctionUrlInput;
  CloudFront?: LwfCloudFrontConfigInput;

  // Pure lwf deployment & packaging options (PascalCase)
  Code?: LwfCodeInput;
  Regions?: string[] | string;
  Exclude?: string[];
  Excludes?: string[];
  Name?: string;

  // Compatibility aliases (camelCase / lowercase)
  lambda?: LwfLambdaFunctionInput;
  functionUrl?: LwfFunctionUrlInput;
  cloudfront?: LwfCloudFrontConfigInput;
  code?: LwfCodeInput;
  regions?: string[] | string;
  exclude?: string[];
  excludes?: string[];
  name?: string;
}

export type LwfConfigFn = () => LwfRawConfig | Promise<LwfRawConfig>;
export type LwfConfigExport = LwfRawConfig | Promise<LwfRawConfig> | LwfConfigFn;

export interface LwfResolvedLambdaConfig extends Omit<LwfLambdaFunctionInput, 'Runtime'> {
  FunctionName: string;
  Runtime: Runtime | string;
  Architectures: ('arm64' | 'x86_64')[];
  MemorySize: number;
  Timeout: number;
  Handler: string;
  Environment: {
    Variables: Record<string, string>;
  };
}

export interface LwfResolvedFunctionUrlConfig {
  AuthType: 'NONE' | 'AWS_IAM';
  Cors?: Cors;
  InvokeMode?: 'BUFFERED' | 'RESPONSE_STREAM';
}

export interface LwfConfig {
  // PascalCase properties
  Name: string;
  Subdomain?: string;
  Code: LwfResolvedCodeMapping[];
  CodeDir: string;
  RootDir: string;
  ConfigPath: string;
  Regions: string[];
  Lambda: LwfResolvedLambdaConfig;
  FunctionUrl: LwfResolvedFunctionUrlConfig;
  CloudFront?: LwfCloudFrontConfig;
  Exclude: string[];
  Excludes: string[];

  // Compatibility aliases (camelCase / lowercase)
  name: string;
  subdomain?: string;
  code: LwfResolvedCodeMapping[];
  codeDir: string;
  rootDir: string;
  configPath: string;
  regions: string[];
  lambda: LwfResolvedLambdaConfig;
  functionUrl: LwfResolvedFunctionUrlConfig;
  cloudfront?: LwfCloudFrontConfig;
  excludes: string[];

  // Convenience accessors
  runtime: string;
  architecture: 'arm64' | 'x86_64';
  memory: number;
  timeout: number;
  concurrency: number;
  auth: 'none' | 'iam';
  corsOrigins: string[];
  corsMethods: string[];
  corsHeaders: string[];
  env: Record<string, string>;
}

export interface PackageResult {
  zipPath: string;
  fileCount: number;
  sizeBytes: number;
  sizeStr: string;
  sha256: string;
}

export interface DeployResult {
  functionName: string;
  revisions: Record<string, string>;
  endpoints: Record<string, string>;
  globalEndpoint?: string;
  packageSizeStr: string;
  sha256: string;
  isDryRun: boolean;
}

export interface DeploymentState {
  name: string;
  regions: string[];
  endpoints: Record<string, string>;
  globalEndpoint?: string;
  lastDeployed: string;
  sha256: string;
  revisions: Record<string, string>;
}
