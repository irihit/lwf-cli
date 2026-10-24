#!/usr/bin/env node

import { createCli } from '../cli.js';

const cli = createCli();
cli.parseAsync(process.argv);
