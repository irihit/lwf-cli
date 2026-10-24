import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCli, VERSION } from './cli.js';

describe('cli', () => {
  test('prints help and version', async () => {
    const cli = createCli();
    await cli.parseAsync(['node', 'lwf', '--help']);
    await cli.parseAsync(['node', 'lwf', '--version']);
  });

  test('handles unknown command with error exitCode', async () => {
    const cli = createCli();
    const origCode = process.exitCode;
    try {
      await cli.parseAsync(['node', 'lwf', 'unknown-cmd']);
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = origCode;
    }
  });

  test('plan and apply --dry-run succeed', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwf-cli-plan-'));
    const origCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      fs.writeFileSync(
        path.join(tmpDir, 'lwf.config.ts'),
        `export default { lambda: { FunctionName: 'test-cli-app' } };\n`,
        'utf-8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'index.js'),
        `console.log('hello');\n`,
        'utf-8'
      );

      const cliPlan = createCli();
      await cliPlan.parseAsync(['node', 'lwf', 'plan']);

      const cliApply = createCli();
      await cliApply.parseAsync(['node', 'lwf', 'apply', '--dry-run']);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
