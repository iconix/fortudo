#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const hookSource = path.join(__dirname, 'pre-commit');
const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
    encoding: 'utf8'
}).trim();
const hooksDir = path.resolve(repoRoot, gitCommonDir, 'hooks');
const hookDest = path.join(hooksDir, 'pre-commit');

// Copy the hook
try {
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.copyFileSync(hookSource, hookDest);
    fs.chmodSync(hookDest, '755');
    console.log('✅ Pre-commit hook installed successfully.');
} catch (err) {
    console.error('Failed to install pre-commit hook:', err.message);
    process.exit(1);
}
