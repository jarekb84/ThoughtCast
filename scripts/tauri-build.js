#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the mode from command line arguments (default to 'local')
const mode = process.argv[2] || 'local';

if (!['local', 'ci'].includes(mode)) {
  console.error('Usage: node tauri-build.js [local|ci]');
  process.exit(1);
}

// Get version from inject-git-version script
const version = execSync(`node scripts/inject-git-version.js ${mode}`, { encoding: 'utf-8' }).trim();

console.log(`Running Tauri build (${mode} mode) with version: ${version}`);

const configPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const cargoPath = join(__dirname, '..', 'src-tauri', 'Cargo.toml');

// Save original files
const originalConfig = readFileSync(configPath, 'utf-8');
const originalCargo = readFileSync(cargoPath, 'utf-8');
let buildSuccess = false;

try {
  // Modify tauri.conf.json with version
  const config = JSON.parse(originalConfig);
  config.version = version;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  // Modify Cargo.toml with version (regex replace the version line)
  const updatedCargo = originalCargo.replace(
    /^version = ".*"$/m,
    `version = "${version}"`
  );
  writeFileSync(cargoPath, updatedCargo, 'utf-8');

  console.log(`✓ Temporarily set version to: ${version}`);

  // Run build
  execSync('npx tauri build', {
    stdio: 'inherit'
  });

  buildSuccess = true;
} catch (error) {
  console.error('Build failed:', error.message);
} finally {
  // Always restore original files
  writeFileSync(configPath, originalConfig, 'utf-8');
  writeFileSync(cargoPath, originalCargo, 'utf-8');
  console.log('✓ Restored tauri.conf.json and Cargo.toml to original state');

  if (!buildSuccess) {
    process.exit(1);
  }
}
