# Releasing

## Prerequisites

- Clean working tree
- Updated `CHANGELOG.md`
- Updated version in `package.json`

## Steps

1. Run tests and build:
   ```bash
   npm install
   npm run build
   ```
2. Tag the release:
   ```bash
   git tag vX.Y.Z
   git push --tags
   ```
3. Create a GitHub release from the tag and attach release notes.
4. Publish to npm (optional):
   ```bash
   npm publish
   ```
