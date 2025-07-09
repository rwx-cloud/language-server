import * as tmp from 'tmp-promise';
import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Creates a temporary test directory with .mint or .rwx structure
 */
export async function createTestEnvironment(type: 'mint' | 'rwx'): Promise<{
  rootDir: string;
  mintDir: string;
  cleanup: () => Promise<void>;
}> {
  const { path: rootDir, cleanup } = await tmp.dir({ unsafeCleanup: true });
  const mintDir = path.join(rootDir, type === 'mint' ? '.mint' : '.rwx');
  await fs.promises.mkdir(mintDir, { recursive: true });
  
  return {
    rootDir,
    mintDir,
    cleanup
  };
}

/**
 * Creates test documents in the temporary directory
 */
export async function createTestFile(dir: string, filename: string, content: string): Promise<string> {
  const filePath = path.join(dir, filename);
  const dirPath = path.dirname(filePath);
  
  // Ensure directory exists
  await fs.promises.mkdir(dirPath, { recursive: true });
  
  // Write file
  await fs.promises.writeFile(filePath, content, 'utf8');
  
  return filePath;
}

/**
 * Creates test documents with proper URI formatting
 */
export function createTestDocument(content: string, filePath: string): TextDocument {
  const uri = URI.file(filePath).toString();
  return TextDocument.create(uri, 'yaml', 1, content);
}

/**
 * Creates YAML content for various test scenarios
 */
export function createYAMLContent(scenario: string): string {
  const scenarios: Record<string, string> = {
    'simple-task': `
tasks:
  - key: hello
    run: echo "Hello, World!"
`,
    'task-with-dependency': `
tasks:
  - key: build
    run: npm run build
  - key: test
    use: build
    run: npm test
`,
    'task-with-array-dependencies': `
tasks:
  - key: setup
    run: npm install
  - key: build
    run: npm run build
  - key: deploy
    use: [setup, build]
    run: npm run deploy
`,
    'yaml-aliases': `
defaults: &defaults
  environment:
    NODE_ENV: production
    
tasks:
  - key: build
    <<: *defaults
    run: npm run build
  - key: test
    <<: *defaults
    run: npm test
`,
    'package-call': `
tasks:
  - key: deploy
    call: mint/deploy-node 1.0.0
    with:
      node-version: "18"
      app-name: my-app
`,
    'embedded-run': `
tasks:
  - key: run-workflow
    call: \${{ run.mint-dir }}/workflows/build.yml
`,
    'invalid-yaml': `
tasks:
  - key: invalid
    run: echo "missing quote
    use: [unclosed, array
`,
    'circular-reference': `
tasks:
  - key: task1
    use: task2
    run: echo "1"
  - key: task2
    use: task1
    run: echo "2"
`,
    'complex-document': `
# Complex RWX Run Definition
version: 1

defaults: &common-env
  environment:
    NODE_VERSION: "18"
    CI: "true"

shared-config: &shared
  retry: 3
  timeout: 300

tasks:
  - key: install-deps
    <<: *shared
    run: |
      npm ci
      npm audit
    
  - key: lint
    use: install-deps
    <<: *common-env
    run: npm run lint
    
  - key: build
    use: install-deps
    <<: *common-env
    call: mint/build-node 1.2.3
    with:
      source: ./src
      output: ./dist
      
  - key: test-unit
    use: [install-deps, build]
    run: npm run test:unit
    
  - key: test-integration
    use: build
    call: \${{ run.mint-dir }}/shared/integration-tests.yml
    
  - key: deploy
    use: [test-unit, test-integration]
    call: mint/deploy-k8s 2.0.0
    with:
      cluster: production
      namespace: my-app
      image: my-app:latest
      replicas: 3
      
triggers:
  - on: push
    branches: [main]
    run: deploy
`
  };
  
  return scenarios[scenario] || scenarios['simple-task'] || '';
}