#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// NOTE: This script outputs the version number ONLY (to stdout)
// It's used with TAURI_CONFIG_VERSION environment variable to override
// the version in tauri.conf.json without modifying the file

// Get the mode from command line arguments
const mode = process.argv[2];

if (!['dev', 'local', 'ci'].includes(mode)) {
  console.error('Usage: node inject-git-version.js <dev|local|ci>');
  process.exit(1);
}

/**
 * Get the latest git tag from the main branch
 * @returns {string} The latest tag (e.g., "v0.1.5")
 */
function getLatestTag() {
  try {
    // Try to get the latest tag from origin/main
    const tag = execSync('git describe --tags --abbrev=0 --match "v*" origin/main', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return tag;
  } catch (error) {
    // If no tags exist or origin/main doesn't exist, try local main
    try {
      const tag = execSync('git describe --tags --abbrev=0 --match "v*" main', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      return tag;
    } catch (err) {
      // If still no tags, return default
      console.warn('No git tags found. Using default version v0.0.0');
      return 'v0.0.0';
    }
  }
}

/**
 * Generate a timestamp for dev builds
 * @returns {string} Timestamp in format YYYYMMDD-HHMMSS
 */
function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Manage the local build counter
 * @param {string} baseVersion - The base version without 'v' prefix (e.g., "0.1.5")
 * @returns {number} The current counter value
 */
function manageLocalCounter(baseVersion) {
  const counterPath = join(__dirname, '..', '.local-build-counter');
  let counter = 1;

  if (existsSync(counterPath)) {
    try {
      const data = JSON.parse(readFileSync(counterPath, 'utf-8'));
      if (data.baseVersion === baseVersion) {
        counter = data.counter + 1;
      }
      // If baseVersion is different, counter resets to 1
    } catch (error) {
      console.warn('Error reading .local-build-counter, resetting to 1');
    }
  }

  // Write updated counter
  writeFileSync(
    counterPath,
    JSON.stringify({ baseVersion, counter }, null, 2),
    'utf-8'
  );

  return counter;
}

/**
 * Check if running in CI environment
 * @returns {boolean}
 */
function isCI() {
  return (
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.TF_BUILD === 'True'
  );
}

/**
 * Generate version string based on mode
 * @param {string} mode - 'dev', 'local', or 'ci'
 * @returns {string} The generated version string
 */
function generateVersion(mode) {
  const tag = getLatestTag();
  const baseVersion = tag.replace(/^v/, ''); // Remove 'v' prefix

  switch (mode) {
    case 'dev':
      // For dev builds, use numeric suffix 0 to indicate development
      // This is MSI-compatible (Windows requires numeric-only pre-release identifiers)
      // Actual version tracking happens via build timestamp logs, not the version string
      return `${baseVersion}-0`;

    case 'local':
      // Check if actually in CI (override mode if necessary)
      if (isCI()) {
        console.log('CI environment detected, using exact version');
        return baseVersion;
      }
      const counter = manageLocalCounter(baseVersion);
      // Use numeric-only suffix for MSI compatibility (Windows MSI requirement)
      // Counter is incremented for each build and reset when base version changes
      return `${baseVersion}-${counter}`;

    case 'ci':
      return baseVersion;

    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}

// Main execution
try {
  const version = generateVersion(mode);
  // Simply output the version - this will be used as TAURI_CONFIG_VERSION env var
  // No file modification needed!
  console.log(version);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
