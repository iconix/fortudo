#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const hookSource = path.join(__dirname, 'pre-commit');
const hookDest = path.join(__dirname, '..', '.git', 'hooks', 'pre-commit');

// Check if .git/hooks exists
const hooksDir = path.dirname(hookDest);
if (!fs.existsSync(hooksDir)) {
    console.log('No .git/hooks directory found. Skipping hook installation.');
    process.exit(0);
}

// Copy the hook
try {
    fs.copyFileSync(hookSource, hookDest);
    fs.chmodSync(hookDest, '755');
    console.log('✅ Pre-commit hook installed successfully.');
} catch (err) {
    console.error('Failed to install pre-commit hook:', err.message);
    process.exit(1);
}
