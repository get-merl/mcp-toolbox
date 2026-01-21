#!/usr/bin/env node

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Find repo root and load .env file from there
const __filename = fileURLToPath(import.meta.url);
const distDir = dirname(__filename); // dist/
const packageDir = dirname(distDir); // packages/mcp-toolbox-benchmark
const packagesDir = dirname(packageDir); // packages/
const repoRoot = dirname(packagesDir); // repo root

// Load .env files from repo root (.env.local overrides .env)
config({ path: resolve(repoRoot, '.env') });
config({ path: resolve(repoRoot, '.env.local'), override: true });

import { createCLI } from './cli.js';

const program = createCLI();
program.parse();
