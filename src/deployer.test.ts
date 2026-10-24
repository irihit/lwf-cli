import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from './config.js';
import { Deployer } from './deployer.js';

describe('deployer (Direct AWS SDK)', () => {
  test('plan calculates specs and packaging without remote calls', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-plan-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  lambda: {
    FunctionName: 'test-sdk-app',
    Runtime: 'nodejs24.x',
    MemorySize: 1024,
    Timeout: 45,
    Environment: {
      Variables: {
        STAGE: 'production',
      },
    },
  },
};
`,
        'utf-8'
      );
      fs.writeFileSync(path.join(tmpDir, 'index.js'), 'export default {};', 'utf-8');

      const config = await loadConfig(cfgPath);
      const deployer = new Deployer(config);
      const pkgRes = await deployer.plan();

      assert.equal(pkgRes.fileCount, 1);
      assert.equal(pkgRes.sha256.length, 64);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('apply with dry-run simulates AWS SDK deployment', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-dry-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  regions: ['ap-northeast-1', 'us-east-1'],
  lambda: {
    FunctionName: 'dryrun-test',
  },
};
`,
        'utf-8'
      );
      fs.writeFileSync(path.join(tmpDir, 'index.js'), 'export default {};', 'utf-8');

      const config = await loadConfig(cfgPath);
      const deployer = new Deployer(config);
      const res = await deployer.apply(true);

      assert.equal(res.isDryRun, true);
      assert.equal(res.functionName, 'dryrun-test');
      assert.equal(typeof res.endpoints['ap-northeast-1'], 'string');
      assert.equal(typeof res.endpoints['us-east-1'], 'string');
      assert.equal(typeof res.globalEndpoint, 'string');
      assert.equal(res.globalEndpoint?.includes('global.on.aws'), true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('apply with cloudfront configuration simulates OAC setup', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cf-dry-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  regions: ['ap-northeast-1'],
  lambda: {
    FunctionName: 'cf-dryrun-app',
  },
  cloudfront: {
    DistributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
    OAC: true,
  },
};
`,
        'utf-8'
      );
      fs.writeFileSync(path.join(tmpDir, 'index.js'), 'export default {};', 'utf-8');

      const config = await loadConfig(cfgPath);
      assert.equal(config.cloudfront?.oac, true);
      assert.equal(config.cloudfront?.OAC, true);
      assert.equal(config.cloudfront?.distributionArns.length, 1);
      assert.equal(config.cloudfront?.DistributionArns.length, 1);

      const deployer = new Deployer(config);
      const res = await deployer.apply(true);

      assert.equal(res.isDryRun, true);
      assert.equal(res.functionName, 'cf-dryrun-app');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('apply with subdomain routing displays preview url in dry run', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-sub-dry-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  regions: ['ap-northeast-1'],
  lambda: {
    FunctionName: 'preview-pr-app',
  },
  cloudfront: {
    DistributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1PDK09ESKHJWT',
    SubdomainRouting: {
      Domain: 'preview.example.com',
    },
  },
};
`,
        'utf-8'
      );
      fs.writeFileSync(path.join(tmpDir, 'index.js'), 'export default {};', 'utf-8');

      const config = await loadConfig(cfgPath, { subdomain: '99' });
      assert.equal(config.cloudfront?.subdomainRouting?.subdomain, '99');
      assert.equal(
        config.cloudfront?.subdomainRouting?.previewUrl,
        'https://99.preview.example.com'
      );

      const deployer = new Deployer(config);
      assert.equal(deployer.getRoleName(), 'preview-pr-app-execution-role-99');

      const res = await deployer.apply(true);

      assert.equal(res.isDryRun, true);
      assert.equal(res.functionName, 'preview-pr-app-99');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('uses user-specified IAM execution role when provided in lambda.Role', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-role-'));
    try {
      const cfgPath = path.join(tmpDir, 'lwf.config.ts');
      fs.writeFileSync(
        cfgPath,
        `
export default {
  lambda: {
    FunctionName: 'custom-role-app',
    Role: 'arn:aws:iam::123456789012:role/MyPreCreatedRole',
  },
};
`,
        'utf-8'
      );
      fs.writeFileSync(path.join(tmpDir, 'index.js'), 'export default {};', 'utf-8');

      const config = await loadConfig(cfgPath);
      const deployer = new Deployer(config);
      const roleArn = await deployer.ensureExecutionRole();

      assert.equal(roleArn, 'arn:aws:iam::123456789012:role/MyPreCreatedRole');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
