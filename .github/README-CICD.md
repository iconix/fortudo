# CI/CD Configuration for Fortudo

This directory contains the GitHub Actions workflows and configuration for the Fortudo project's CI/CD pipeline.

## 🚀 Workflows Overview

### 1. Main CI/CD Pipeline (`ci-cd.yml`)
**Triggers:** Push to `main`/`develop`, Pull Requests to `main`/`develop`

**Jobs:**
- **Test & Lint**: Runs on Node.js 18.x and 20.x matrix
  - ESLint code linting
  - Prettier formatting checks
  - Jest test suite with coverage
  - Uploads coverage to Codecov
- **Build**: Verifies build artifacts and uploads them
- **Deploy Preview**: Deploys PR previews to Firebase Hosting (7-day expiry)
- **Deploy Production**: Deploys to production on main branch pushes
  - Creates GitHub releases automatically

### 2. Security Checks (`security.yml`)
**Triggers:** Push, Pull Requests, Daily at 2 AM UTC

**Jobs:**
- **Security Audit**: npm audit for vulnerabilities
- **Dependency Review**: Reviews new dependencies in PRs
- **CodeQL Analysis**: Static code analysis for security issues

### 3. Dependency Updates (`dependency-updates.yml`)
**Triggers:** Weekly on Mondays at 9 AM UTC, Manual dispatch

**Jobs:**
- **Update Dependencies**: Automatically updates patch/minor versions
- **Check Major Updates**: Creates issues for major version updates

### 4. Dependabot Configuration (`dependabot.yml`)
- Automated dependency updates for npm packages and GitHub Actions
- Groups minor/patch updates together
- Excludes major updates (handled by custom workflow)

## 🔧 Setup Requirements

### Required Secrets
Make sure these secrets are configured in your GitHub repository:

1. **`FIREBASE_SERVICE_ACCOUNT_FORTUDO`**: Firebase service account key for deployment
   - Go to Firebase Console → Project Settings → Service Accounts
   - Generate new private key and add the JSON content as a secret

### Optional Integrations

1. **Codecov**: For test coverage reporting
   - Sign up at [codecov.io](https://codecov.io)
   - Add your repository
   - No additional secrets needed (uses GITHUB_TOKEN)

## 🌟 Features

### ✅ Continuous Integration
- Multi-version Node.js testing (18.x, 20.x)
- Code quality checks (ESLint, Prettier)
- Comprehensive test suite with coverage
- Security vulnerability scanning

### 🚀 Continuous Deployment
- Automatic preview deployments for PRs
- Production deployments on main branch
- Automatic GitHub releases
- Firebase Hosting integration

### 🔒 Security
- Daily security audits
- Dependency vulnerability scanning
- CodeQL static analysis
- License compliance checking

### 🔄 Automation
- Automated dependency updates
- PR creation for dependency updates
- Issue creation for major updates
- Automatic cleanup of preview deployments

## 📊 Workflow Status

You can monitor the status of all workflows in the [Actions tab](../../actions) of your repository.

### Status Badges
Add these to your main README.md:

```markdown
[![CI/CD Pipeline](https://github.com/iconix/fortudo/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/iconix/fortudo/actions/workflows/ci-cd.yml)
[![Security Checks](https://github.com/iconix/fortudo/actions/workflows/security.yml/badge.svg)](https://github.com/iconix/fortudo/actions/workflows/security.yml)
[![codecov](https://codecov.io/gh/iconix/fortudo/branch/main/graph/badge.svg)](https://codecov.io/gh/iconix/fortudo)
```

## 🛠 Customization

### Modifying Workflows
- **Node.js versions**: Update the matrix in `ci-cd.yml`
- **Deployment branches**: Modify the branch conditions
- **Security schedule**: Change the cron expression in `security.yml`
- **Dependency update frequency**: Adjust the schedule in `dependabot.yml`

### Adding New Checks
1. Create a new workflow file in `.github/workflows/`
2. Follow the existing patterns for consistency
3. Add appropriate triggers and job dependencies

## 🔍 Troubleshooting

### Common Issues

1. **Firebase deployment fails**
   - Check that `FIREBASE_SERVICE_ACCOUNT_FORTUDO` secret is correctly set
   - Verify Firebase project ID matches in workflows

2. **Tests fail in CI but pass locally**
   - Check Node.js version compatibility
   - Ensure all dependencies are in `package.json`
   - Review environment-specific configurations

3. **Security checks fail**
   - Review npm audit output
   - Update vulnerable dependencies
   - Consider adding exceptions for false positives

### Getting Help
- Check the [Actions tab](../../actions) for detailed logs
- Review individual workflow run details
- Check the [Issues tab](../../issues) for automated dependency update notifications

## 📝 Maintenance

### Regular Tasks
- Review and merge automated dependency PRs
- Monitor security alerts and address vulnerabilities
- Update workflow configurations as needed
- Review and update Node.js versions in matrix

### Quarterly Reviews
- Audit workflow performance and optimization opportunities
- Review security configurations and update as needed
- Evaluate new GitHub Actions features and integrations
