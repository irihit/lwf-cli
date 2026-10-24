/**
 * Rich terminal UI helpers for lwf CLI using built-in ANSI escape sequences.
 */

const isColorSupported =
  !('NO_COLOR' in process.env) &&
  ('FORCE_COLOR' in process.env || (process.stdout?.isTTY ?? false));

const formatter = (open: string, close: string) => (input: any) =>
  isColorSupported ? `${open}${input}${close}` : String(input);

export const colors = {
  bold: formatter('\x1b[1m', '\x1b[22m'),
  dim: formatter('\x1b[2m', '\x1b[22m'),
  red: formatter('\x1b[31m', '\x1b[39m'),
  green: formatter('\x1b[32m', '\x1b[39m'),
  yellow: formatter('\x1b[33m', '\x1b[39m'),
  blue: formatter('\x1b[34m', '\x1b[39m'),
  magenta: formatter('\x1b[35m', '\x1b[39m'),
  cyan: formatter('\x1b[36m', '\x1b[39m'),
  white: formatter('\x1b[37m', '\x1b[39m'),
  gray: formatter('\x1b[90m', '\x1b[39m'),
};

export function success(msg: string): void {
  console.log(` ${colors.bold(colors.green('✔'))}  ${msg}`);
}

export function info(msg: string): void {
  console.log(` ${colors.bold(colors.blue('ℹ'))}  ${msg}`);
}

export function warn(msg: string): void {
  console.log(` ${colors.bold(colors.yellow('⚠'))}  ${colors.yellow(msg)}`);
}

export function error(msg: string): void {
  console.error(` ${colors.bold(colors.red('✖'))}  ${colors.red(msg)}`);
}

export function step(stepNum: number, totalSteps: number, msg: string): void {
  const prefix = colors.bold(colors.cyan(`[${stepNum}/${totalSteps}]`));
  console.log(`\n${prefix} ${colors.bold(msg)}`);
}

export function header(title: string, subtitle = ''): void {
  const line = '━'.repeat(60);
  console.log(colors.bold(colors.cyan(`\n⚡ lwf: ${title}`)));
  if (subtitle) {
    console.log(colors.dim(`   ${subtitle}`));
  }
  console.log(colors.dim(line));
}

export function table(rows: Array<[string, string]>, title = ''): void {
  if (title) {
    console.log(`\n${colors.bold(title)}:`);
  }
  const maxKeyLen = Math.max(...rows.map(([k]) => k.length), 15);
  for (const [key, val] of rows) {
    console.log(`  ${colors.dim(key.padEnd(maxKeyLen))} : ${val}`);
  }
}

export function printBox(
  content: string[],
  title = '',
  borderColor: 'green' | 'yellow' | 'cyan' = 'cyan'
): void {
  const maxLen = Math.max(...content.map((l) => l.length), 40, title.length + 4);
  const width = maxLen + 4;

  const colorFn =
    borderColor === 'green'
      ? colors.green
      : borderColor === 'yellow'
      ? colors.yellow
      : colors.cyan;

  const topBorder = `╭─ ${colors.bold(title)} ` + '─'.repeat(Math.max(0, width - title.length - 5)) + '╮';
  const bottomBorder = '╰' + '─'.repeat(width - 1) + '╯';

  console.log(colorFn(topBorder));
  for (const line of content) {
    const padded = line + ' '.repeat(Math.max(0, width - line.length - 3));
    console.log(`${colorFn('│')} ${padded}${colorFn('│')}`);
  }
  console.log(colorFn(bottomBorder));
}
