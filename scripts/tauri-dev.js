#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get version from inject-git-version script
const version = execSync('node scripts/inject-git-version.js dev', { encoding: 'utf-8' }).trim();

console.log(`Running Tauri dev with version: ${version}`);

const configPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const cargoPath = join(__dirname, '..', 'src-tauri', 'Cargo.toml');

// Save original files
const originalConfig = readFileSync(configPath, 'utf-8');
const originalCargo = readFileSync(cargoPath, 'utf-8');

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

  // Run dev server
  execSync('npx tauri dev', {
    stdio: 'inherit'
  });
} catch (error) {
  // Will be interrupted by Ctrl+C, that's normal
  if (error.signal !== 'SIGINT') {
    console.error('Dev server error:', error.message);
  }
} finally {
  // Always restore original files
  writeFileSync(configPath, originalConfig, 'utf-8');
  writeFileSync(cargoPath, originalCargo, 'utf-8');
  console.log('\n✓ Restored tauri.conf.json and Cargo.toml to original state');
}
