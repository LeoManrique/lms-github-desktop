#!/usr/bin/env node
const { execSync } = require('child_process')

// Native module needs to be built on all platforms
try {
  execSync('node-gyp rebuild', { stdio: 'inherit' })
} catch (err) {
  // node-gyp rebuild failed - this is expected on some platforms/configurations
  // The TypeScript output is pre-compiled, so the module can still be imported
  console.log('Note: native module build failed, falling back to stub')
  process.exit(0)
}
