# Publishing to npm

This document contains instructions for maintaining and publishing this package to the npm registry.

## Prerequisites

1. You need an npm account
2. You need to be logged in to npm from your terminal
3. You need to have appropriate access rights to publish this package

## Before Publishing

1. Make sure all changes are committed and pushed to the repository
2. Update the version number in `package.json` according to [Semantic Versioning](https://semver.org/)
3. Update `CHANGELOG.md` with the changes in the new version
4. Run the tests to make sure everything is working
   ```
   npm test
   ```

## Publishing

To publish the package, run:

```bash
# First time publishing
npm publish --access=public

# Subsequent publishing
npm publish
```

## Publishing a Beta/Test Version

To publish a beta or test version:

```bash
# Update version in package.json to something like "1.0.0-beta.1"
npm publish --tag beta
```

## After Publishing

1. Create a git tag for the version:
   ```
   git tag -a v1.0.0 -m "Version 1.0.0"
   git push origin v1.0.0
   ```

2. Create a release on GitHub with the changes from the CHANGELOG.md

## Troubleshooting

If you encounter any issues during publishing:

1. Make sure you're logged in to npm:
   ```
   npm whoami
   ```

2. Check if the package name is available:
   ```
   npm view npm-dependencies-mcp
   ```

3. If you're trying to update an existing package, make sure the version number is higher than the currently published version 