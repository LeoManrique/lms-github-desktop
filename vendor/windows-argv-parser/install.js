#!/usr/bin/env node
// This module is Windows-only. Skip building on other platforms.
if (process.platform !== 'win32') {
  console.log('Skipping windows-argv-parser build on non-Windows platform')
  process.exit(0)
}

const { execSync } = require('child_process')
try {
  execSync('node-gyp rebuild && tsc', { stdio: 'inherit' })
} catch (err) {
  process.exit(1)
}
