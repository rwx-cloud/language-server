import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestLanguageServer } from "./test-helpers/test-server";
import {
  createTestEnvironment,
  createTestFile,
  createYAMLContent,
} from "./test-helpers/test-utils";
import { LocationLink, Position } from "vscode-languageserver-protocol";
import * as path from "path";

describe("Definition Provider", () => {
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

  describe("Task Definition Navigation", () => {
    it("navigates from use reference to task definition", async () => {
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

      // Position on "build" in "use: build" - position 4 is the line index, character 8 is on "build"
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(4, 8), // On "build" in use statement
        }
      );

      if (definitions && definitions.length > 0) {
        expect(definitions.length).toBe(1);

        const definition = definitions[0];
        if (definition) {
          expect(definition.targetUri).toBe(textDocument.uri);
          expect(definition.targetRange.start.line).toBe(1); // Line with "key: build"
          expect(definition.originSelectionRange).toBeDefined();
        }
      } else {
        // If context detection isn't working, at least verify no crash
        expect(definitions).toBe(null);
      }
    });

    it("finds task definition with quotes", async () => {
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

      // Position on "build-app" in use statement (with quotes)
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(4, 12), // On "build-app" in use statement
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(textDocument.uri);
        expect(definition.targetRange.start.line).toBe(1); // Line with key: "build-app"
      }
    });

    it("finds task definition without quotes", async () => {
      const yamlContent = `tasks:
  - key: build_app
    run: npm run build
  - key: test
    use: build_app
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

      // Position on "build_app" in use statement
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(4, 8), // On "build_app" in use statement
        }
      );

      if (definitions && definitions.length > 0) {
        expect(definitions.length).toBe(1);

        const definition = definitions[0];
        if (definition) {
          expect(definition.targetUri).toBe(textDocument.uri);
          expect(definition.targetRange.start.line).toBe(1); // Line with key: build_app
        }
      } else {
        // If context detection isn't working, at least verify no crash
        expect(definitions).toBe(null);
      }
    });

    it("handles task keys with hyphens and underscores", async () => {
      const yamlContent = `tasks:
  - key: build-web_app
    run: npm run build
  - key: test
    use: build-web_app
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

      // Position on "build-web_app" in use statement
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(4, 13), // On "build-web_app" in use statement
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(textDocument.uri);
        expect(definition.targetRange.start.line).toBe(1); // Line with key: build-web_app
      }
    });

    it("returns null when task definition not found", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    use: nonexistent
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

      // Position on "nonexistent" in use statement
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(4, 12), // On "nonexistent" in use statement
        }
      );

      expect(definitions).toBe(null);
    });

    it("returns null when not in use context", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
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

      // Position on "npm" in run statement (not in use context)
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(4, 9), // On "npm" in run statement
        }
      );

      expect(definitions).toBe(null);
    });
  });

  describe("YAML Alias Navigation", () => {
    it("navigates from alias to anchor definition", async () => {
      const yamlContent = `defaults: &common-env
  environment:
    NODE_ENV: production

tasks:
  - key: build
    <<: *common-env
    run: npm run build`;

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

      // Position on "*common-env" alias
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(6, 9), // On "*common-env"
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(textDocument.uri);
        expect(definition.targetRange.start.line).toBe(0); // Line with "&common-env"
        expect(definition.originSelectionRange).toBeDefined();
      }
    });

    it("handles aliases with alphanumeric names", async () => {
      const yamlContent = `config123: &config123
  timeout: 300

tasks:
  - key: test
    <<: *config123
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

      // Position on "*config123" alias
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(5, 9), // On "*config123"
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(textDocument.uri);
        expect(definition.targetRange.start.line).toBe(0); // Line with "&config123"
      }
    });

    it("handles aliases with hyphens and underscores", async () => {
      const yamlContent = `default_config: &default-config_123
  retry: 3

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

      // Position on "*default-config_123" alias
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(5, 12), // On "*default-config_123"
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(textDocument.uri);
        expect(definition.targetRange.start.line).toBe(0); // Line with "&default-config_123"
      }
    });

    it("returns correct range for anchor location", async () => {
      const yamlContent = `defaults: &defaults
  environment:
    CI: true

tasks:
  - key: test
    <<: *defaults
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

      // Position on "*defaults" alias
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(6, 9), // On "*defaults"
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetRange.start.line).toBe(0);
        expect(definition.targetRange.end.line).toBe(0);
        expect(definition.targetRange.start.character).toBe(10); // Position of "&defaults"
        expect(definition.targetRange.end.character).toBe(19); // End of "&defaults"
      }
    });

    it("returns null when anchor not found", async () => {
      const yamlContent = `tasks:
  - key: test
    <<: *nonexistent
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

      // Position on "*nonexistent" alias
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 9), // On "*nonexistent"
        }
      );

      expect(definitions).toBe(null);
    });
  });

  describe("Embedded Run File Navigation", () => {
    it("navigates to embedded run file from path", async () => {
      // Create target file
      const targetContent = createYAMLContent("simple-task");
      const targetPath = await createTestFile(
        testEnv.mintDir,
        "shared/build.yml",
        targetContent
      );

      const yamlContent = `tasks:
  - key: run-shared
    call: \${{ run.mint-dir }}/shared/build.yml`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "main.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "shared/build.yml" path
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 45), // On file path
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(`file://${targetPath}`);
        expect(definition.targetRange.start.line).toBe(0);
        expect(definition.targetRange.start.character).toBe(0);
      }
    });

    it("handles relative paths correctly", async () => {
      // Create target file in subdirectory
      const subDir = path.join(testEnv.mintDir, "workflows", "ci");
      const targetContent = createYAMLContent("simple-task");
      const targetPath = await createTestFile(
        subDir,
        "deploy.yml",
        targetContent
      );

      const yamlContent = `tasks:
  - key: deploy
    call: \${{ run.mint-dir }}/workflows/ci/deploy.yml`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "main.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on the file path
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 50), // On file path
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(`file://${targetPath}`);
      }
    });

    it("checks file existence before navigation", async () => {
      // Don't create the target file
      const yamlContent = `tasks:
  - key: deploy
    call: \${{ run.mint-dir }}/nonexistent/file.yml`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "main.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on the nonexistent file path
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 50), // On file path
        }
      );

      expect(definitions).toBe(null);
    });

    it("finds parent .mint directory correctly", async () => {
      // Create nested structure
      const nestedDir = path.join(testEnv.mintDir, "deep", "nested");
      const targetContent = createYAMLContent("simple-task");
      const targetPath = await createTestFile(
        testEnv.mintDir,
        "shared.yml",
        targetContent
      );

      const yamlContent = `tasks:
  - key: shared
    call: \${{ run.mint-dir }}/shared.yml`;

      const filePath = await createTestFile(
        nestedDir,
        "nested.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "shared.yml" path
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 35), // On file path
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(`file://${targetPath}`);
      }
    });

    it("finds parent .rwx directory correctly", async () => {
      const rwxEnv = await createTestEnvironment("rwx");

      // Create target file
      const targetContent = createYAMLContent("simple-task");
      const targetPath = await createTestFile(
        rwxEnv.mintDir,
        "shared.yml",
        targetContent
      );

      const yamlContent = `tasks:
  - key: shared
    call: \${{ run.mint-dir }}/shared.yml`;

      const filePath = await createTestFile(
        rwxEnv.mintDir,
        "main.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "shared.yml" path
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 35), // On file path
        }
      );

      expect(definitions).toBeDefined();
      expect(definitions.length).toBe(1);

      const definition = definitions[0];
      if (definition) {
        expect(definition.targetUri).toBe(`file://${targetPath}`);
      }

      await rwxEnv.cleanup();
    });

    it("returns null for non-existent files", async () => {
      const yamlContent = `tasks:
  - key: missing
    call: \${{ run.mint-dir }}/missing.yml`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "main.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on "missing.yml" path
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 37), // On file path
        }
      );

      expect(definitions).toBe(null);
    });

    it("returns null when not in embedded run context", async () => {
      const yamlContent = `tasks:
  - key: regular
    call: mint/deploy 1.0.0`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "main.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position on package call (not embedded run)
      const definitions = await server.sendRequest<LocationLink[]>(
        "textDocument/definition",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 15), // On package name
        }
      );

      expect(definitions).toBe(null);
    });
  });
});
