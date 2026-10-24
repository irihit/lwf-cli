# lwf (Lambda Web Functions CLI)

> **Declarative, effortless deployment tool for AWS Lambda Web Functions built with TypeScript.**  
> Deploy standard HTTP web servers (Hono, Express, Fastify, Next.js, Vanilla Node.js) to AWS Lambda with a single command: `lwf apply`.

[![npm version](https://img.shields.io/npm/v/lwf-cli.svg)](https://www.npmjs.com/package/lwf-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 Overview

**AWS Lambda Web Functions** is AWS's modern compute primitive that lets you run standard HTTP web servers directly on AWS Lambda without needing adaptation layers (like API Gateway wrappers or AWS Lambda Web Adapter). Key features:

- 🌐 **Native HTTP Servers**: Your application directly binds to `process.env.AWS_LAMBDA_HTTP_ENDPOINT`.
- ⚡ **Multi-Concurrency**: A single warm execution environment handles multiple concurrent requests simultaneously.
- 💰 **Active CPU Billing**: You only pay for active CPU cycles, not idle time spent waiting on database queries or third-party APIs.
- 🌍 **Multi-Region Anycast Routing**: Deploy across multiple regions and get an automatic latency-routed global endpoint.
- 🚀 **Direct AWS SDK Engine**: Completely eliminates CloudFormation stack overhead. Deploys directly via `@aws-sdk/client-lambda` and `@aws-sdk/client-iam` in seconds.

**`lwf`** is a TypeScript-based developer-friendly CLI designed to manage and deploy Lambda Web Functions declaratively, similar to `terraform apply` or `kubectl apply`.

---

## 📦 Installation

### Global Installation (CLI)
Install globally with npm, yarn, or pnpm:

```bash
npm install -g lwf-cli
# or
pnpm add -g lwf-cli
# or
yarn global add lwf-cli
```

### Instant Execution via `npx`
Run directly without installing globally:

```bash
npx lwf-cli apply
```

### Local Dev Dependency
Add to your project's `devDependencies`:

```bash
npm install --save-dev lwf-cli
```
And add scripts to `package.json`:
```json
{
  "scripts": {
    "deploy": "lwf apply",
    "plan": "lwf plan"
  }
}
```

---

## ⚡ Quick Start

### 1. Create `lwf.config.ts`
Create a configuration file in your project:

```typescript
import { defineConfig } from 'lwf-cli';

export default defineConfig({
  Lambda: {
    FunctionName: 'my-web-app',
  },
});
```

### 2. Preview changes (Plan)
```bash
lwf plan
```

### 3. Deploy to AWS Lambda Web Functions
```bash
lwf apply
```

**Example Output:**
```text
⚡ lwf: Deploying Lambda Web Function
   my-web-app -> ap-northeast-1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/4] Packaging code artifacts
 ✔  Packaged 3 files (1.1 KB) -> SHA256: 7f1b224d86f7...

[2/4] Connecting to AWS Lambda Web service
 ✔  Deployed successfully via aws lambda-web CLI!

[4/4] Finalizing endpoints and routing
╭─ DEPLOYMENT SUCCESSFUL ────────────────────────────────────────────────────────────╮
│ Function: my-web-app                                                               │
│ Runtime:  nodejs24.x (arm64)                                                       │
│                                                                                    │
│ Endpoints:                                                                         │
│   • [ap-northeast-1] https://my-web-app.ap-northeast-1.lambda-web.on.aws           │
│                                                                                    │
│ Test your function:                                                                │
│   curl https://my-web-app.ap-northeast-1.lambda-web.on.aws                         │
╰─────────────────────────────────────────────────────────────────────────────────────╯
```

---

## 🛠️ CLI Commands

| Command | Description |
| :--- | :--- |
| **`lwf apply`** | Build, package, and deploy the Web Function to AWS |
| **`lwf plan`** | Preview configuration, packaging artifacts, and target endpoints |
| **`lwf status`** | Check deployment status, active revisions, and live endpoints |
| **`lwf destroy`** | Tear down deployed function and delete associated endpoints |
| **`lwf dev`** | Run local server injecting `AWS_LAMBDA_HTTP_ENDPOINT` for emulation |

### Options for `lwf apply`:
- `-c, --config <path>`: Specify configuration file (defaults to `lwf.config.ts`).
- `--dry-run`: Simulate deployment without modifying AWS resources.
- `-s, --subdomain <sub>`: Subdomain identifier for routing / preview environments (e.g. `42`, `feat-login`, `staging`).
- `-y, --yes`: Auto-confirm prompts.

---

## 📝 Configuration (`lwf.config.ts`)

Define your infrastructure and service parameters declaratively in `lwf.config.ts` with full TypeScript type safety and autocompletion using `defineConfig`.
Lambda function settings directly wrap the AWS SDK arguments (`CreateFunctionCommandInput`):

```typescript
import { defineConfig } from 'lwf-cli';

export default defineConfig({
  // Deployment & packaging options
  // For standard TypeScript projects: map dist/ contents to root and include dependencies
  Code: [
    { src: 'dist', dest: '.' },
    'node_modules',
    'package.json',
  ],
  Regions: ['ap-northeast-1', 'us-east-1'],

  // AWS Lambda configuration (wrapping @aws-sdk/client-lambda CreateFunctionCommandInput)
  Lambda: {
    FunctionName: 'my-web-app',
    Runtime: 'nodejs24.x',
    Architectures: ['arm64'],
    MemorySize: 512,       // Memory in MB (128 - 10240)
    Timeout: 30,           // Timeout in seconds (1 - 900)
    Environment: {
      Variables: {
        NODE_ENV: 'production',
        APP_SECRET: 'my-secret-value',
      },
    },
    // Any AWS SDK parameter can be specified directly:
    // VpcConfig: { SubnetIds: ['...'], SecurityGroupIds: ['...'] },
    // EphemeralStorage: { Size: 1024 },
    // LoggingConfig: { LogFormat: 'JSON' },
    // Layers: ['arn:aws:lambda:...'],
  },

  // Function URL configuration (wrapping @aws-sdk/client-lambda CreateFunctionUrlConfigCommandInput)
  FunctionUrl: {
    AuthType: 'NONE',      // NONE | AWS_IAM
    Cors: {
      AllowOrigins: ['*'],
      AllowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    },
  },

  // Optional CloudFront Integration (Attaches existing distribution ARN without creating resources)
  CloudFront: {
    DistributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
    // or list multiple distributions:
    // DistributionArns: ['arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT'],

    // Enable Origin Access Control (OAC) to secure endpoint and block direct internet traffic
    OAC: true,

    // On-demand Preview / Tenant Environments via Subdomain Routing:
    SubdomainRouting: {
      Domain: 'preview.example.com',
    },
  },

  // Additional files or directories to exclude from the deployment package
  // (Defaults like .git, .env*, .lwf, lwf.config.* are excluded automatically)
  Exclude: [
    'test/**',
    '*.md',
    '*.zip',
  ],
});
```

### Flexible `Code` Packaging Options

The `Code` property supports three formats to accommodate any project structure:

1. **Single directory string** (maps all files inside to the root of the ZIP archive):
   ```typescript
   Code: 'dist' // or Code: '.'
   ```
2. **Array of paths** (preserves folder names inside the ZIP):
   ```typescript
   Code: ['dist', 'node_modules', 'package.json']
   ```
3. **Source-to-Destination mappings (`{ src, dest }`)**:
   Flattens build output (e.g., `dist/`) to the archive root while including top-level `node_modules/` and `package.json`:
   ```typescript
   Code: [
     { src: 'dist', dest: '.' },
     'node_modules',
     'package.json',
   ]
   ```

---

## 💻 Programmatic TypeScript API

You can also use `lwf` programmatically in your TypeScript / JavaScript scripts or CI/CD pipelines:

```typescript
import { loadConfig, Deployer, createPackage } from 'lwf-cli';

// 1. Load and validate configuration
const config = await loadConfig('./lwf.config.ts');

// 2. Package artifacts
const pkg = await createPackage(config);
console.log(`Packaged ${pkg.fileCount} files, SHA256: ${pkg.sha256}`);

// 3. Deploy
const deployer = new Deployer(config);
const result = await deployer.apply();
console.log(`Deployed to: ${Object.values(result.endpoints).join(', ')}`);
```

---

## 💡 How Web Functions Code Works

Lambda Web Functions inject host and port information into the `AWS_LAMBDA_HTTP_ENDPOINT` environment variable. Your application simply reads it and starts an HTTP server:

### Hono
```javascript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
app.get('/', (c) => c.json({ message: 'Hello from Lambda Web Functions!' }));

const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT || '127.0.0.1:3000';
const [host, portStr] = endpoint.split(':');
const port = parseInt(portStr || '3000', 10);

serve({ fetch: app.fetch, port, hostname: host });
```

### Express
```javascript
import express from 'express';

const app = express();
app.get('/', (req, res) => res.json({ message: 'Hello from Express!' }));

const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT || '127.0.0.1:3000';
const [host, portStr] = endpoint.split(':');
const port = parseInt(portStr || '3000', 10);

app.listen(port, host, () => {
  console.log(`Listening on ${host}:${port}`);
});
```

---

## 📄 License

MIT License
