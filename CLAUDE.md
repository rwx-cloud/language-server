# RWX Language Server

This directory contains the Language Server Protocol (LSP) implementation for RWX/Mint CI/CD workflow files. The server provides intelligent language features for YAML files in `.mint/` and `.rwx/` directories.

## Architecture Overview

### Core Components

**`src/server.ts`** - Main language server implementation that handles:

- LSP protocol initialization and lifecycle management
- Document validation using RWX YAML parser
- Intelligent completion for packages, tasks, and file paths
- Go-to-definition for task references and YAML aliases
- Hover information for packages and parameters
- Find references for tasks and anchors
- Code actions for package version updates

**`support/parser.js`** - Pre-built JavaScript parser for RWX YAML files. This is compiled from TypeScript in another repository (`parser2.ts` in the `mint` repo) and checked into this project as a built artifact.

### Language Features

#### Document Validation

- **File Detection**: Only processes files in `.mint/` or `.rwx/` directories with `.yml` or `.yaml` extensions
- **Parser Integration**: Uses RWX-specific YAML parser for detailed error reporting and validation
- **Real-time Diagnostics**: Provides syntax errors, semantic validation, and package version warnings

#### Intelligent Completion

- **Task Completion**: Auto-complete task names in `use:` contexts (both single values and arrays)
- **Package Completion**: Fetches available packages from `https://cloud.rwx.com/mint/api/` with versions
- **Parameter Completion**: Provides package parameter suggestions in `with:` blocks
- **File Path Completion**: Completes file paths in embedded run contexts (`${{ run.mint-dir }}/`)

#### Navigation Features

- **Task Definitions**: Navigate from `use: task-name` to task definition
- **YAML Aliases**: Navigate between YAML anchors (`&name`) and aliases (`*name`)
- **Embedded Files**: Navigate to files referenced in `call: ${{ run.mint-dir }}/path`

#### Information on Hover

- **Package Information**: Shows package description, version, and documentation
- **Parameter Details**: Displays parameter descriptions, required status, and default values

#### References and Code Actions

- **Find References**: Locate all usages of tasks and YAML anchors
- **Version Updates**: Provides code actions to update outdated package versions

### External Dependencies

#### RWX Cloud API Integration

The server integrates with RWX cloud services for package management:

- **Package List**: `GET https://cloud.rwx.com/mint/api/leaves/documented`
- **Package Details**: `GET https://cloud.rwx.com/mint/api/leaves/{org}/{package}/{version}/documentation`
- **Caching**: Implements intelligent caching (1 hour for package lists, indefinite for package details)
- **Error Handling**: Gracefully handles API failures and network timeouts

## Testing Philosophy

### **CRITICAL: No Mocking Policy**

This codebase follows a **strict no-mocking policy** for testing. This decision is intentional and must be maintained:

#### Why No Mocks?

1. **Real Integration Testing**: We test the actual behavior of the language server as users will experience it
2. **API Reliability**: By making real HTTP requests to `cloud.rwx.com`, we catch API changes and network issues
3. **Filesystem Reality**: Using real temporary directories catches cross-platform path issues
4. **Parser Fidelity**: Testing with the actual RWX parser ensures we handle real-world YAML edge cases
5. **LSP Protocol Accuracy**: Spawning real server processes tests the complete LSP message flow

#### What We DON'T Mock

- ❌ **HTTP Requests**: No mocking of `fetch()` calls to cloud.rwx.com API
- ❌ **Filesystem Operations**: No mocking of `fs` module or file operations
- ❌ **YamlParser**: No mocking of the RWX parser - we test real parsing behavior
- ❌ **LSP Protocol**: No mocking of LSP messages - we use real JSON-RPC communication
- ❌ **External Processes**: No mocking of child processes or server spawning

#### What We DO Use

- ✅ **Real API Calls**: Tests make actual HTTP requests to production APIs
- ✅ **Temporary Directories**: Each test creates isolated temp directories with `tmp-promise`
- ✅ **Real Parser**: Tests use the actual compiled RWX YAML parser
- ✅ **Actual LSP Server**: Tests spawn real language server processes via Node.js child_process
- ✅ **Integration Focus**: Every test validates end-to-end behavior

### NO CONDITIONALS IN TESTS

Tests should not use `if` statements. Tests should be deterministic, so they should never have branching logic. If there are typescript errors because a variable is potentially `undefined`, don't do this:

```
if (thing) {
  expect(thing)...
}
```

Instead, fix the typescript error by asserting that thing exists:

```
assert(thing);
expect(thing)...
```

### Test Architecture

#### Test Infrastructure

**`test/test-helpers/test-server.ts`** - `TestLanguageServer` class that:

- Spawns actual language server processes using Node.js child_process
- Handles LSP JSON-RPC protocol communication
- Manages request/response lifecycles with proper timeouts
- Provides clean startup/shutdown for each test

**`test/test-helpers/test-utils.ts`** - Utility functions for:

- Creating isolated temporary directory environments
- Generating test YAML content with various complexity levels
- Setting up `.mint/` and `.rwx/` directory structures
- Managing file creation and cleanup

#### Test Coverage

**134 Total Tests** across 8 test files:

- **lifecycle.test.ts** (10 tests) - Server initialization and configuration
- **diagnostics.test.ts** (16 tests) - Document validation and error reporting
- **completion.test.ts** (27 tests) - All completion providers (22 passing, 5 API timeouts)
- **definition.test.ts** (18 tests) - Go-to-definition functionality
- **hover.test.ts** (16 tests) - Hover information providers
- **references.test.ts** (18 tests) - Find references functionality
- **code-actions.test.ts** (16 tests) - Code action providers
- **utils.test.ts** (13 tests) - Utility functions and edge cases

#### Test Execution Strategy

```bash
# Run all tests
npm test

# Run specific test file
npm test -- hover.test.ts

# Run with coverage
npm run test:coverage

# TypeScript compilation check
npx tsc --noEmit
```

#### Test Environment Management

Each test follows this pattern:

1. **Setup**: Create `TestLanguageServer` instance and temporary directory
2. **Initialization**: Start server and set up LSP protocol handlers
3. **Test Execution**: Create test files, send LSP requests, verify responses
4. **Cleanup**: Stop server and remove temporary directories

#### Handling External Dependencies

**API Timeouts**: Some tests may timeout when `cloud.rwx.com` is slow or unavailable. This is expected and acceptable - it validates our timeout handling.

**Network Failures**: Tests are designed to gracefully handle API failures and should not crash the language server.

**Cross-Platform**: Tests use proper path handling and temporary directories to work on Windows, macOS, and Linux.

## Development Guidelines

### Adding New Features

1. **Implementation**: Add feature to `src/server.ts`
2. **Testing**: Create comprehensive tests that exercise the real functionality
3. **No Mocks**: Ensure tests use real dependencies (filesystem, network, parser)
4. **Error Handling**: Test both success and failure scenarios
5. **Documentation**: Update this CLAUDE.md file with new feature details

### Debugging Tests

- **Server Logs**: Check stderr output for server-side errors
- **LSP Messages**: Enable verbose logging to see LSP request/response cycles
- **Temporary Files**: Tests create temp directories - inspect them if tests fail
- **API Responses**: Check network tab or logs for actual API responses

### Performance Considerations

- **Caching**: Server implements intelligent caching for package data
- **Timeouts**: Tests use appropriate timeouts for network operations
- **Cleanup**: Proper cleanup prevents resource leaks in test runs
- **Parallelization**: Tests can run in parallel due to isolated temp directories

## Maintenance Notes

### Parser Updates

The `support/parser.js` file is built from another repository. When updating:

1. Build the parser in the `mint` repository using `cd ~/code/mint && pnpm run build-parser`
2. Copy the compiled JavaScript to `support/parser.js` (if it's not already there)
3. Run tests to ensure compatibility
4. Update type definitions if parser interface changes

### API Changes

When RWX cloud API changes:

1. Update API calls in `src/server.ts`
2. Run integration tests to catch breaking changes
3. Update test expectations if API responses change
4. Maintain backward compatibility where possible

### TypeScript Compliance

The codebase maintains strict TypeScript compliance:

- `noUnusedLocals: true` - No unused variables
- `noUnusedParameters: true` - No unused parameters
- `strict: true` - All strict checks enabled
- `noUncheckedIndexedAccess: true` - Safe array/object access
- Run `npx tsc --noEmit` to verify before commits

Remember: **No mocking means no compromises**. Our tests validate real-world behavior and catch issues that mocked tests would miss.
