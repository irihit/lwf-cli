import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, defineConfig, ConfigError } from './config.js';

describe('config', () => {
  test('defineConfig returns config object untouched', () => {
    const raw = { lambda: { FunctionName: 'test-define-config', MemorySize: 512 } };
    assert.deepEqual(defineConfig(raw), raw);
  });

  test('loads TypeScript configuration with defaults', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cfg-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `export default { lambda: { FunctionName: 'test-service' } };\n`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      assert.equal(config.name, 'test-service');
      assert.equal(config.lambda.FunctionName, 'test-service');
      assert.equal(config.runtime, 'nodejs24.x');
      assert.equal(config.architecture, 'arm64');
      assert.equal(config.memory, 512);
      assert.equal(config.timeout, 30);
      assert.equal(config.auth, 'none');
      assert.deepEqual(config.regions, ['ap-northeast-1']);
      assert.deepEqual(config.corsOrigins, ['*']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('loads TypeScript configuration using function export', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cfg-fn-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `export default () => ({ lambda: { FunctionName: 'fn-service', MemorySize: 1024 } });\n`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      assert.equal(config.name, 'fn-service');
      assert.equal(config.memory, 1024);
      assert.equal(config.lambda.MemorySize, 1024);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('passes through advanced SDK arguments (VpcConfig, EphemeralStorage, LoggingConfig)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cfg-sdk-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  lambda: {
    FunctionName: 'sdk-adv-app',
    VpcConfig: {
      SubnetIds: ['subnet-12345678'],
      SecurityGroupIds: ['sg-12345678'],
    },
    EphemeralStorage: {
      Size: 1024,
    },
    LoggingConfig: {
      LogFormat: 'JSON',
      ApplicationLogLevel: 'INFO',
    },
  },
};
`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      assert.equal(config.name, 'sdk-adv-app');
      assert.deepEqual(config.lambda.VpcConfig?.SubnetIds, ['subnet-12345678']);
      assert.equal(config.lambda.EphemeralStorage?.Size, 1024);
      assert.equal(config.lambda.LoggingConfig?.LogFormat, 'JSON');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('validates invalid function name', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cfg-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `export default { lambda: { FunctionName: "invalid name with spaces!" } };\n`,
        'utf-8'
      );

      await assert.rejects(async () => await loadConfig(cfgPath), ConfigError);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('validates invalid memory size', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cfg-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `export default { lambda: { MemorySize: 50 } };\n`,
        'utf-8'
      );

      await assert.rejects(async () => await loadConfig(cfgPath), ConfigError);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('parses cloudfront configuration with camelCase or snake_case', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cfg-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  lambda: {
    FunctionName: 'cf-app',
  },
  cloudfront: {
    distributionArn: 'arn:aws:cloudfront::123456789012:distribution/EDFDVBD632BHGR5',
    oac: true,
  },
};
`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      assert.notEqual(config.cloudfront, undefined);
      assert.deepEqual(config.cloudfront?.distributionArns, [
        'arn:aws:cloudfront::123456789012:distribution/EDFDVBD632BHGR5',
      ]);
      assert.equal(config.cloudfront?.oac, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('parses cloudfront configuration with PascalCase SDK pattern (DistributionArn, OAC, SubdomainRouting, Domain)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cf-pascal-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  lambda: {
    FunctionName: 'cf-pascal-app',
  },
  cloudfront: {
    DistributionArn: 'arn:aws:cloudfront::123456789012:distribution/EDFDVBD632BHGR5',
    OAC: true,
    SubdomainRouting: {
      Domain: 'preview.example.com',
    },
  },
};
`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath, { subdomain: 'pr-456' });
      assert.notEqual(config.cloudfront, undefined);
      assert.deepEqual(config.cloudfront?.distributionArns, [
        'arn:aws:cloudfront::123456789012:distribution/EDFDVBD632BHGR5',
      ]);
      assert.deepEqual(config.cloudfront?.DistributionArns, [
        'arn:aws:cloudfront::123456789012:distribution/EDFDVBD632BHGR5',
      ]);
      assert.equal(config.cloudfront?.oac, true);
      assert.equal(config.cloudfront?.OAC, true);
      assert.equal(config.cloudfront?.subdomainRouting?.subdomain, 'pr-456');
      assert.equal(config.cloudfront?.subdomainRouting?.domain, 'preview.example.com');
      assert.equal(config.cloudfront?.subdomainRouting?.Domain, 'preview.example.com');
      assert.equal(
        config.cloudfront?.subdomainRouting?.previewUrl,
        'https://pr-456.preview.example.com'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('parses naked DistributionId and prefixes arn:aws:cloudfront:::distribution/', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cf-distid-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  lambda: {
    FunctionName: 'cf-id-app',
  },
  cloudfront: {
    DistributionId: 'E1PDK09ESKHJWT',
  },
};
`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      assert.deepEqual(config.cloudfront?.distributionArns, [
        'arn:aws:cloudfront:::distribution/E1PDK09ESKHJWT',
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('interpolates SUBDOMAIN and configures subdomain routing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-sub-domain-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  lambda: {
    FunctionName: 'preview-app-\${SUBDOMAIN}',
  },
  cloudfront: {
    distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
    subdomainRouting: {
      domain: 'preview.example.com',
    },
  },
};
`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath, { subdomain: 'pr-123' });
      assert.equal(config.name, 'preview-app-pr-123');
      assert.notEqual(config.cloudfront?.subdomainRouting, undefined);
      assert.equal(config.cloudfront?.subdomainRouting?.subdomain, 'pr-123');
      assert.equal(config.cloudfront?.subdomainRouting?.domain, 'preview.example.com');
      assert.equal(
        config.cloudfront?.subdomainRouting?.previewUrl,
        'https://pr-123.preview.example.com'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });


  test('automatically appends -${subdomain} suffix when subdomain is provided', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-sub-suffix-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  lambda: {
    FunctionName: 'my-web-app',
  },
  cloudfront: {
    distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
  },
};
`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath, { subdomain: '42' });
      assert.equal(config.name, 'my-web-app-42');
      assert.equal(config.subdomain, '42');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('loads TypeScript configuration with pure PascalCase root keys (Lambda, FunctionUrl, CloudFront, Regions, Exclude)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-pascal-root-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  Regions: ['ap-northeast-1', 'us-east-1'],
  Exclude: ['temp/**'],
  Lambda: {
    FunctionName: 'pascal-service',
    Runtime: 'nodejs24.x',
    MemorySize: 1024,
    Timeout: 60,
  },
  FunctionUrl: {
    AuthType: 'NONE',
    Cors: {
      AllowOrigins: ['https://example.com'],
    },
  },
  CloudFront: {
    DistributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
    OAC: true,
    SubdomainRouting: {
      Domain: 'preview.example.com',
    },
  },
};
`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath, { subdomain: 'pr-999' });

      // Check PascalCase properties
      assert.equal(config.Name, 'pascal-service-pr-999');
      assert.deepEqual(config.Regions, ['ap-northeast-1', 'us-east-1']);
      assert.equal(config.Exclude.includes('temp/**'), true);
      assert.equal(config.Lambda.FunctionName, 'pascal-service-pr-999');
      assert.equal(config.Lambda.MemorySize, 1024);
      assert.equal(config.FunctionUrl.AuthType, 'NONE');
      assert.deepEqual(config.FunctionUrl.Cors?.AllowOrigins, ['https://example.com']);
      assert.equal(config.CloudFront?.OAC, true);
      assert.equal(config.CloudFront?.SubdomainRouting?.Domain, 'preview.example.com');
      assert.equal(
        config.CloudFront?.SubdomainRouting?.PreviewUrl,
        'https://pr-999.preview.example.com'
      );

      // Check compatibility aliases
      assert.equal(config.name, 'pascal-service-pr-999');
      assert.deepEqual(config.regions, ['ap-northeast-1', 'us-east-1']);
      assert.equal(config.excludes.includes('temp/**'), true);
      assert.equal(config.lambda.FunctionName, 'pascal-service-pr-999');
      assert.equal(config.functionUrl.AuthType, 'NONE');
      assert.equal(config.cloudfront?.oac, true);
      assert.equal(config.cloudfront?.subdomainRouting?.domain, 'preview.example.com');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('loads configuration from JSON file (lwf.config.json)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-json-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.json');
      fs.writeFileSync(
        cfgPath,
        JSON.stringify({
          Lambda: {
            FunctionName: 'json-service',
            MemorySize: 256,
          },
          Regions: ['ap-northeast-1'],
        }),
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      assert.equal(config.Name, 'json-service');
      assert.equal(config.Lambda.MemorySize, 256);
      assert.deepEqual(config.Regions, ['ap-northeast-1']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('validates invalid JSON syntax with ConfigError', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-bad-json-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.json');
      fs.writeFileSync(cfgPath, '{ invalid json', 'utf-8');

      await assert.rejects(
        async () => await loadConfig(cfgPath),
        /JSON syntax error/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('rejects YAML files with migration error', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-yaml-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.yaml');
      fs.writeFileSync(cfgPath, 'name: legacy\n', 'utf-8');

      await assert.rejects(
        async () => await loadConfig(cfgPath),
        /YAML configuration files are no longer supported/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('supports single string Code mapping to root', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-code-single-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(
        cfgPath,
        `export default { lambda: { FunctionName: 'test-single' }, Code: 'dist' };\n`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      assert.equal(config.Code.length, 1);
      assert.equal(config.Code[0].src, distDir);
      assert.equal(config.Code[0].dest, '.');
      assert.equal(config.CodeDir, 'dist (-> .)');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('supports array of paths and { src, dest } mappings in Code', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-code-multi-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      const distDir = path.join(tmpDir, 'dist');
      const nmDir = path.join(tmpDir, 'node_modules');
      const pkgFile = path.join(tmpDir, 'package.json');
      fs.mkdirSync(distDir);
      fs.mkdirSync(nmDir);
      fs.writeFileSync(pkgFile, '{"name":"test"}\n', 'utf-8');

      fs.writeFileSync(
        cfgPath,
        `export default {
          lambda: { FunctionName: 'test-multi' },
          Code: [
            { src: 'dist', dest: '.' },
            'node_modules',
            'package.json'
          ]
        };\n`,
        'utf-8'
      );

      const config = await loadConfig(cfgPath);
      assert.equal(config.Code.length, 3);
      assert.deepEqual(config.Code, [
        { src: distDir, dest: '.' },
        { src: nmDir, dest: 'node_modules' },
        { src: pkgFile, dest: 'package.json' },
      ]);
      assert.equal(config.CodeDir, 'dist (-> .), node_modules, package.json');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('validates non-existent Code path with ConfigError', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-code-err-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `export default { lambda: { FunctionName: 'test-err' }, Code: 'non-existent-dir' };\n`,
        'utf-8'
      );

      await assert.rejects(
        async () => await loadConfig(cfgPath),
        /Code path 'non-existent-dir'/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('validates invalid Code entry object with ConfigError', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-code-inv-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `export default { lambda: { FunctionName: 'test-inv' }, Code: [{ invalid: 123 } as any] };\n`,
        'utf-8'
      );

      await assert.rejects(
        async () => await loadConfig(cfgPath),
        /Invalid Code entry/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
