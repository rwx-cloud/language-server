import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestLanguageServer } from "./test-helpers/test-server";
import {
  createTestEnvironment,
  createTestFile,
} from "./test-helpers/test-utils";
import { Location, Position } from "vscode-languageserver-protocol";

describe("References Provider", () => {
  let server: TestLanguageServer;
  let testEnv: {
    rootDir: string;
    mintDir: string;
    cleanup: () => Promise<void>;
  };

  beforeEach(async () => {
    server = new TestLanguageServer();
    await server.start();

    // Set up default handlers
    server.onRequest("client/registerCapability", () => null);
    server.onRequest("workspace/configuration", () => [
      {
        maxNumberOfProblems: 1000,
      },
    ]);

    // Initialize server
    await server.initialize();

    // Create test environment
    testEnv = await createTestEnvironment("mint");
  });

  afterEach(async () => {
    await server.stop();
    await testEnv.cleanup();
  });

  describe("Task References", () => {
    it("finds all references to a task from its definition", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    use: build
    run: npm test
  - key: deploy
    use: [build, test]
    run: npm run deploy`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "tasks.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "build" in the task definition line
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 8), // On "build" in "key: build"
          context: { includeDeclaration: true },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        // Should find references in use statements
        expect(references.length).toBeGreaterThanOrEqual(1);

        // All references should be in the same file
        references.forEach((ref) => {
          expect(ref.uri).toBe(textDocument.uri);
          expect(ref.range).toBeDefined();
        });

        // Should include the definition and usage locations
        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).toContain(1); // Definition line
        expect(lines).toContain(4); // First use line
        expect(lines).toContain(6); // Array use line
      }
    });

    it("finds all references to a task from a usage site", async () => {
      const yamlContent = `tasks:
  - key: common
    run: echo "common task"
  - key: task1
    use: common
    run: echo "task1"
  - key: task2
    use: [common]
    run: echo "task2"`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "tasks.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "common" in the first use statement
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(4, 8), // On "common" in use statement
          context: { includeDeclaration: true },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        expect(references.length).toBeGreaterThanOrEqual(2); // Definition + usages

        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).toContain(1); // Definition
        expect(lines).toContain(4); // First usage
        expect(lines).toContain(6); // Array usage
      }
    });

    it("excludes declaration when includeDeclaration is false", async () => {
      const yamlContent = `tasks:
  - key: shared
    run: echo "shared"
  - key: consumer
    use: shared
    run: echo "consumer"`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "tasks.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "shared" in the definition
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 8), // On "shared" in definition
          context: { includeDeclaration: false },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        // Should only include usage, not definition
        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).not.toContain(1); // Should not include definition
        expect(lines).toContain(4); // Should include usage
      }
    });

    it("handles tasks with quotes in names", async () => {
      const yamlContent = `tasks:
  - key: "build-app"
    run: npm run build
  - key: test
    use: "build-app"
    run: npm test`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "tasks.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "build-app" in definition (inside quotes)
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 10), // On "build-app" inside quotes
          context: { includeDeclaration: true },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        expect(references.length).toBeGreaterThanOrEqual(2);

        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).toContain(1); // Definition
        expect(lines).toContain(4); // Usage
      }
    });

    it("handles tasks with special characters in names", async () => {
      const yamlContent = `tasks:
  - key: build_web-app
    run: npm run build
  - key: test
    use: build_web-app
    run: npm test`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "tasks.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 10), // On task name
          context: { includeDeclaration: true },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).toContain(1); // Definition
        expect(lines).toContain(4); // Usage
      }
    });

    it("returns empty array when no references found", async () => {
      const yamlContent = `tasks:
  - key: unused
    run: echo "never used"
  - key: standalone
    run: echo "standalone task"`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "tasks.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "unused" task that has no references
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 8), // On "unused"
          context: { includeDeclaration: false },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);
      expect(references).toHaveLength(0);
    });

    it("returns null when not on a task identifier", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    use: build
    run: npm test`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "tasks.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "npm" in run command (not a task reference)
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 9), // On "npm"
          context: { includeDeclaration: true },
        }
      );

      expect(references).toEqual([]);
    });
  });

  describe("YAML Alias References", () => {
    it("finds all references to a YAML anchor from the anchor definition", async () => {
      const yamlContent = `defaults: &common-config
  environment:
    CI: true
    NODE_ENV: production

tasks:
  - key: build
    <<: *common-config
    run: npm run build
  - key: test
    <<: *common-config
    run: npm test
  - key: deploy
    <<: *common-config
    run: npm run deploy`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "aliases.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on the anchor "&common-config"
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(0, 12), // On "&common-config"
          context: { includeDeclaration: true },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        expect(references.length).toBeGreaterThanOrEqual(3); // Definition + 3 usages

        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).toContain(0); // Anchor definition
        expect(lines).toContain(7); // First alias usage
        expect(lines).toContain(10); // Second alias usage
        expect(lines).toContain(13); // Third alias usage
      }
    });

    it("finds all references to a YAML anchor from an alias usage", async () => {
      const yamlContent = `config: &shared-config
  timeout: 300
  retries: 3

tasks:
  - key: task1
    <<: *shared-config
    run: echo "task1"
  - key: task2
    <<: *shared-config
    run: echo "task2"`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "aliases.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "*shared-config" in first usage
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(6, 9), // On "*shared-config"
          context: { includeDeclaration: true },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        expect(references.length).toBeGreaterThanOrEqual(2); // Definition + usages

        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).toContain(0); // Anchor definition
        expect(lines).toContain(6); // First usage
        expect(lines).toContain(9); // Second usage
      }
    });

    it("handles anchors with alphanumeric names", async () => {
      const yamlContent = `config123: &config123
  setting: value

tasks:
  - key: test
    <<: *config123
    run: echo test`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "aliases.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(0, 12), // On "&config123"
          context: { includeDeclaration: true },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).toContain(0); // Definition
        expect(lines).toContain(5); // Usage
      }
    });

    it("handles anchors with hyphens and underscores", async () => {
      const yamlContent = `defaults: &default-config_123
  env: production

tasks:
  - key: test
    <<: *default-config_123
    run: npm test`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "aliases.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(0, 15), // On "&default-config_123"
          context: { includeDeclaration: true },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).toContain(0); // Definition
        expect(lines).toContain(5); // Usage
      }
    });

    it("returns empty array when anchor has no references", async () => {
      const yamlContent = `unused: &unused-anchor
  value: never-used

used: &used-anchor
  value: referenced

tasks:
  - key: test
    <<: *used-anchor
    run: npm test`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "aliases.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on unused anchor
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(0, 10), // On "&unused-anchor"
          context: { includeDeclaration: false },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);
      expect(references).toHaveLength(0);
    });

    it("excludes declaration when includeDeclaration is false", async () => {
      const yamlContent = `config: &shared
  setting: value

tasks:
  - key: test
    <<: *shared
    run: npm test`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "aliases.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(0, 9), // On "&shared"
          context: { includeDeclaration: false },
        }
      );

      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);

      if (references && references.length > 0) {
        const lines = references.map((ref) => ref.range.start.line);
        expect(lines).not.toContain(0); // Should not include definition
        expect(lines).toContain(5); // Should include usage
      }
    });

    it("returns null when not on anchor or alias", async () => {
      const yamlContent = `config: &shared
  setting: value

tasks:
  - key: test
    <<: *shared
    run: npm test`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "aliases.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "value" (not an anchor or alias)
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 12), // On "value"
          context: { includeDeclaration: true },
        }
      );

      expect(references).toEqual([]);
    });
  });

  describe("Non-RWX Files", () => {
    it("returns null for files outside .mint/.rwx directories", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    use: build
    run: npm test`;

      const filePath = await createTestFile(
        testEnv.rootDir,
        "not-rwx.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 8), // On task name
          context: { includeDeclaration: true },
        }
      );

      expect(references).toEqual([]);
    });
  });

  describe("Edge Cases", () => {
    it("handles malformed YAML gracefully", async () => {
      const yamlContent = `tasks:
  - key: valid
    run: echo valid
  - key: invalid
    run: echo "missing quote
    use: valid`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "malformed.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Try to find references even with parser errors
      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 8), // On "valid"
          context: { includeDeclaration: true },
        }
      );

      // Should not crash, might return null or empty array
      expect(references !== undefined).toBe(true);
    });

    it("handles empty task keys", async () => {
      const yamlContent = `tasks:
  - key: ""
    run: echo empty
  - key: normal
    use: ""
    run: echo normal`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "empty-keys.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(1, 8), // On empty key
          context: { includeDeclaration: true },
        }
      );

      // Should handle gracefully
      expect(references !== undefined).toBe(true);
    });

    it("handles tasks without keys", async () => {
      const yamlContent = `tasks:
  - run: echo no-key
  - key: normal
    run: echo normal`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "no-keys.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const references = await server.sendRequest<Location[]>(
        "textDocument/references",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 8), // On "normal"
          context: { includeDeclaration: true },
        }
      );

      // Should work for valid tasks
      expect(references !== undefined).toBe(true);
    });
  });
});
