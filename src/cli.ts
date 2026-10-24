/**
 * Declarative CLI command router using built-in Node.js node:util.parseArgs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import * as ui from './ui.js';
import { loadConfig, ConfigError } from './config.js';
import { Deployer } from './deployer.js';
import { PackagingError } from './packager.js';
import { LwfConfig } from './types.js';

export const VERSION = '0.1.0';

interface CommandOption {
  type: 'string' | 'boolean';
  short?: string;
  argName?: string;
  description: string;
  default?: string | boolean;
}

interface CommandDef {
  description: string;
  usage?: string;
  options?: Record<string, CommandOption>;
  run: (values: Record<string, any>, positionals: string[]) => Promise<void> | void;
}

/**
 * Common configuration options shared across deployment commands.
 */
const COMMON_ROUTING_OPTIONS: Record<string, CommandOption> = {
  config: { type: 'string', short: 'c', argName: 'path', description: 'Path to configuration file', default: 'lwf.config.ts' },
  subdomain: { type: 'string', short: 's', argName: 'sub', description: 'Subdomain identifier for routing' },
};

async function resolveConfig(values: Record<string, any>): Promise<LwfConfig> {
  return await loadConfig(values.config as string | undefined, {
    subdomain: values.subdomain as string | undefined,
  });
}

const COMMANDS: Record<string, CommandDef> = {
  apply: {
    description: 'Deploy or update the Lambda Web Function according to configuration',
    options: {
      ...COMMON_ROUTING_OPTIONS,
      'dry-run': { type: 'boolean', description: 'Preview deployment changes without modifying AWS resources' },
      yes: { type: 'boolean', short: 'y', description: 'Automatic yes to prompts' },
    },
    run: async (values) => {
      const config = await resolveConfig(values);
      const deployer = new Deployer(config);
      await deployer.apply(Boolean(values['dry-run']));
    },
  },

  plan: {
    description: 'Show changes and artifacts required to reach current configuration',
    options: COMMON_ROUTING_OPTIONS,
    run: async (values) => {
      const config = await resolveConfig(values);
      const deployer = new Deployer(config);
      await deployer.plan();
    },
  },
  status: {
    description: 'Show status and public endpoints of the deployed function',
    options: COMMON_ROUTING_OPTIONS,
    run: async (values) => {
      const config = await resolveConfig(values);
      const deployer = new Deployer(config);
      deployer.status();
    },
  },

  destroy: {
    description: 'Destroy the deployed Lambda Web Function and its endpoints',
    options: {
      ...COMMON_ROUTING_OPTIONS,
      yes: { type: 'boolean', short: 'y', description: 'Confirm deletion without prompting' },
    },
    run: async (values) => {
      const config = await resolveConfig(values);
      const deployer = new Deployer(config);
      await deployer.destroy(Boolean(values.yes));
    },
  },

  dev: {
    description: 'Run local development server simulating AWS_LAMBDA_HTTP_ENDPOINT',
    options: {
      port: { type: 'string', short: 'p', argName: 'port', description: 'Local port', default: '3000' },
      host: { type: 'string', short: 'H', argName: 'host', description: 'Local host', default: '127.0.0.1' },
      watch: { type: 'boolean', short: 'w', description: 'Enable auto-reload watch mode', default: true },
    },
    run: (values) => {
      const port = parseInt(String(values.port || '3000'), 10) || 3000;
      const host = String(values.host || '127.0.0.1');
      const endpoint = `${host}:${port}`;

      ui.header('Local Development Mode', `Simulating Lambda Web Functions at http://${endpoint}`);
      ui.info(`Injecting environment variable: ${ui.colors.bold(`AWS_LAMBDA_HTTP_ENDPOINT=${endpoint}`)}`);

      const env = { ...process.env, AWS_LAMBDA_HTTP_ENDPOINT: endpoint };
      const cwd = process.cwd();
      let cmd = 'node';
      let spawnArgs: string[] = [];

      const shouldWatch = values.watch !== false;

      if (fs.existsSync(path.join(cwd, 'package.json'))) {
        cmd = 'npm';
        spawnArgs = shouldWatch ? ['run', 'dev'] : ['start'];
      } else if (fs.existsSync(path.join(cwd, 'index.js'))) {
        cmd = 'node';
        spawnArgs = shouldWatch ? ['--watch', 'index.js'] : ['index.js'];
      }

      const child = spawn(cmd, spawnArgs, { env, stdio: 'inherit' });
      child.on('close', (code) => {
        process.exitCode = code || 0;
      });
    },
  },
};

function normalizeArgv(argv: string[]): string[] {
  if (
    argv.length >= 2 &&
    (argv[0].endsWith('node') ||
      argv[0].endsWith('node.exe') ||
      path.basename(argv[0]).startsWith('node'))
  ) {
    return argv.slice(2);
  }
  return argv;
}

function printMainHelp(): void {
  console.log(`Usage: lwf <command> [options]

lwf - Effortless, declarative deployment tool for AWS Lambda Web Functions

Commands:`);

  for (const [name, cmd] of Object.entries(COMMANDS)) {
    const label = `${name}${cmd.usage ? ` ${cmd.usage}` : ''}`;
    console.log(`  ${label.padEnd(18)} ${cmd.description}`);
  }

  console.log(`
Options:
  -v, --version        Output the current version of lwf
  -h, --help           Display help for command
`);
}

function printCommandHelp(name: string, cmd: CommandDef): void {
  console.log(`Usage: lwf ${name} ${cmd.usage || '[options]'}

${cmd.description}

Options:`);

  const optRows: Array<[string, string]> = [];
  for (const [key, opt] of Object.entries(cmd.options || {})) {
    const shortPrefix = opt.short ? `-${opt.short}, ` : '    ';
    const flag = opt.type === 'boolean' ? `--${key}` : `--${key} <${opt.argName || 'val'}>`;
    const label = `${shortPrefix}${flag}`;
    const defStr = opt.default !== undefined ? ` (default: ${opt.default})` : '';
    optRows.push([label, `${opt.description}${defStr}`]);
  }
  optRows.push(['-h, --help', 'Display help for command']);

  const maxLen = Math.max(...optRows.map(([lbl]) => lbl.length));
  for (const [lbl, desc] of optRows) {
    console.log(`  ${lbl.padEnd(maxLen + 2)} ${desc}`);
  }
  console.log();
}

export async function runCli(rawArgs: string[] = process.argv): Promise<void> {
  const args = normalizeArgv(rawArgs);

  if (args.length === 0) {
    printMainHelp();
    return;
  }

  const firstArg = args[0];

  if (firstArg === '-v' || firstArg === '--version') {
    console.log(VERSION);
    return;
  }

  if (firstArg === '-h' || firstArg === '--help') {
    printMainHelp();
    return;
  }

  const commandName = firstArg;
  const cmd = COMMANDS[commandName];

  if (!cmd) {
    ui.error(`Unknown command: '${commandName}'`);
    printMainHelp();
    process.exitCode = 1;
    return;
  }

  const cmdArgs = args.slice(1);
  const parseOptions: Record<string, { type: 'string' | 'boolean'; short?: string }> = {
    help: { type: 'boolean', short: 'h' },
  };

  for (const [key, opt] of Object.entries(cmd.options || {})) {
    const entry: { type: 'string' | 'boolean'; short?: string } = { type: opt.type };
    if (opt.short) {
      entry.short = opt.short;
    }
    parseOptions[key] = entry;
  }

  const { values, positionals } = parseArgs({
    args: cmdArgs,
    options: parseOptions,
    allowPositionals: true,
    strict: false,
  });

  if (values.help) {
    printCommandHelp(commandName, cmd);
    return;
  }

  try {
    await cmd.run(values, positionals);
  } catch (err: any) {
    if (err instanceof ConfigError || err instanceof PackagingError) {
      ui.error(err.message);
    } else {
      ui.error(`${commandName} failed: ${err.message || err}`);
    }
    process.exitCode = 1;
  }
}

export function createCli() {
  return {
    async parseAsync(argv: string[] = process.argv): Promise<void> {
      await runCli(argv);
    },
  };
}
