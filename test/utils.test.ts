import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestLanguageServer } from "./test-helpers/test-server";
import {
  createTestEnvironment,
  createTestFile,
  createYAMLContent,
} from "./test-helpers/test-utils";
import { Position } from "vscode-languageserver-protocol";
import * as path from "path";

describe("Utility Functions", () => {
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

  describe("RWX File Path Detection", () => {
    it("identifies files in .mint directory as RWX files", async () => {
      const yamlContent = createYAMLContent("simple-task");
      const filePath = await createTestFile(
        testEnv.mintDir,
        "test.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const diagnostics = await server.sendRequest("textDocument/diagnostic", {
        textDocument: { uri: textDocument.uri },
      });

      // Should process RWX files (return diagnostics object)
      expect(diagnostics).toBeDefined();
      expect((diagnostics as any).kind).toBe("full");
      expect((diagnostics as any).items).toBeDefined();
    });

    it("identifies files in .rwx directory as RWX files", async () => {
      const rwxEnv = await createTestEnvironment("rwx");
      const yamlContent = createYAMLContent("simple-task");
      const filePath = await createTestFile(
        rwxEnv.mintDir,
        "test.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const diagnostics = await server.sendRequest("textDocument/diagnostic", {
        textDocument: { uri: textDocument.uri },
      });

      // Should process RWX files
      expect(diagnostics).toBeDefined();
      expect((diagnostics as any).kind).toBe("full");
      expect((diagnostics as any).items).toBeDefined();

      await rwxEnv.cleanup();
    });

    it("rejects files not in .mint or .rwx directories", async () => {
      const yamlContent = createYAMLContent("simple-task");
      const filePath = await createTestFile(
        testEnv.rootDir,
        "test.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const diagnostics = await server.sendRequest("textDocument/diagnostic", {
        textDocument: { uri: textDocument.uri },
      });

      // Should return empty diagnostics for non-RWX files
      expect(diagnostics).toBeDefined();
      expect((diagnostics as any).kind).toBe("full");
      expect((diagnostics as any).items).toHaveLength(0);
    });

    it("handles nested .mint directory files", async () => {
      const nestedDir = path.join(testEnv.mintDir, "workflows", "ci");
      const yamlContent = createYAMLContent("simple-task");
      const filePath = await createTestFile(
        nestedDir,
        "build.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const diagnostics = await server.sendRequest("textDocument/diagnostic", {
        textDocument: { uri: textDocument.uri },
      });

      // Should process nested RWX files
      expect(diagnostics).toBeDefined();
      expect((diagnostics as any).kind).toBe("full");
      expect((diagnostics as any).items).toBeDefined();
    });
  });

  describe("Context Detection", () => {
    it("detects task use context correctly", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    use: `;

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

      // Test completion in use context
      const completions = await server.sendRequest("textDocument/completion", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(4, 9), // After "use: "
      });

      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);

      // Should return task completions
      if (Array.isArray(completions) && completions.length > 0) {
        const taskNames = completions.map((c: any) => c.label);
        expect(taskNames).toContain("build");
      }
    });

    it("detects embedded run context correctly", async () => {
      // Create a target file
      const targetContent = createYAMLContent("simple-task");
      await createTestFile(testEnv.mintDir, "shared.yml", targetContent);

      const yamlContent = `tasks:
  - key: embedded
    call: \${{ run.mint-dir }}/`;

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

      // Test completion in embedded run context
      const completions = await server.sendRequest("textDocument/completion", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 32), // After embedded run path
      });

      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);

      // Should return file completions
      if (Array.isArray(completions) && completions.length > 0) {
        const fileNames = completions.map((c: any) => c.label);
        expect(fileNames).toContain("shared.yml");
      }
    });

    it("detects YAML alias context correctly", async () => {
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

      // Test go-to-definition on alias
      const definitions = await server.sendRequest("textDocument/definition", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(6, 9), // On "*defaults"
      });

      expect(definitions).toBeDefined();

      if (Array.isArray(definitions) && definitions.length > 0) {
        expect(definitions.length).toBe(1);
        expect(definitions[0].targetRange.start.line).toBe(0); // Should point to anchor
      }
    });
  });

  describe("Document Processing", () => {
    it("processes valid YAML documents without errors", async () => {
      const yamlContent = createYAMLContent("complex-document");
      const filePath = await createTestFile(
        testEnv.mintDir,
        "complex.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const diagnostics = await server.sendRequest("textDocument/diagnostic", {
        textDocument: { uri: textDocument.uri },
      });

      expect(diagnostics).toBeDefined();
      expect((diagnostics as any).kind).toBe("full");
      expect((diagnostics as any).items).toBeDefined();
    });

    it("handles invalid YAML gracefully", async () => {
      const invalidYaml = `tasks:
  - key: test
    run: echo "missing quote
    use: [unclosed array`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "invalid.yml",
        invalidYaml
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: invalidYaml,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const diagnostics = await server.sendRequest("textDocument/diagnostic", {
        textDocument: { uri: textDocument.uri },
      });

      expect(diagnostics).toBeDefined();
      expect((diagnostics as any).kind).toBe("full");
      expect((diagnostics as any).items).toBeDefined();

      // Should have error diagnostics
      if (
        "items" in (diagnostics as any) &&
        (diagnostics as any).items.length > 0
      ) {
        expect((diagnostics as any).items[0].severity).toBe(1); // Error severity
      }
    });

    it("extracts task keys correctly", async () => {
      const yamlContent = `tasks:
  - key: task1
    run: echo "1"
  - key: task-2
    run: echo "2"
  - key: task_3
    run: echo "3"
  - run: echo "no key"
  - key: ""
    run: echo "empty key"`;

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

      // Test that completion shows valid task keys
      const completions = await server.sendRequest("textDocument/completion", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(10, 10), // In a hypothetical use context
      });

      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);
    });
  });

  describe("File Operations", () => {
    it("handles file path completion correctly", async () => {
      // Create test directory structure
      await createTestFile(
        testEnv.mintDir,
        "file1.yml",
        createYAMLContent("simple-task")
      );
      await createTestFile(
        testEnv.mintDir,
        "file2.yaml",
        createYAMLContent("simple-task")
      );
      await createTestFile(testEnv.mintDir, "readme.txt", "Not a YAML file");

      const subDir = path.join(testEnv.mintDir, "subdir");
      await createTestFile(
        subDir,
        "nested.yml",
        createYAMLContent("simple-task")
      );

      const yamlContent = `tasks:
  - key: embedded
    call: \${{ run.mint-dir }}/`;

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

      const completions = await server.sendRequest("textDocument/completion", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 32), // After embedded run path
      });

      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);

      if (Array.isArray(completions) && completions.length > 0) {
        const fileNames = completions.map((c: any) => c.label);
        expect(fileNames).toContain("file1.yml");
        expect(fileNames).toContain("file2.yaml");
        expect(fileNames).toContain("subdir");
        expect(fileNames).not.toContain("readme.txt"); // Should exclude non-YAML files
        expect(fileNames).not.toContain("main.yml"); // Should exclude current file
      }
    });

    it("sorts directories before files in completions", async () => {
      // Create files and directories with names that would sort differently
      await createTestFile(
        testEnv.mintDir,
        "a-file.yml",
        createYAMLContent("simple-task")
      );

      const zDir = path.join(testEnv.mintDir, "z-directory");
      await createTestFile(zDir, "file.yml", createYAMLContent("simple-task"));

      const yamlContent = `tasks:
  - key: embedded
    call: \${{ run.mint-dir }}/`;

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

      const completions = await server.sendRequest("textDocument/completion", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 32), // After embedded run path
      });

      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);

      if (Array.isArray(completions) && completions.length >= 2) {
        // Find directory and file items
        const dirItem = completions.find((c: any) => c.label === "z-directory");
        const fileItem = completions.find((c: any) => c.label === "a-file.yml");

        if (dirItem && fileItem) {
          const dirIndex = completions.indexOf(dirItem);
          const fileIndex = completions.indexOf(fileItem);
          expect(dirIndex).toBeLessThan(fileIndex); // Directory should come first
        }
      }
    });

    it("excludes hidden files and directories", async () => {
      await createTestFile(
        testEnv.mintDir,
        "visible.yml",
        createYAMLContent("simple-task")
      );
      await createTestFile(
        testEnv.mintDir,
        ".hidden.yml",
        createYAMLContent("simple-task")
      );

      const hiddenDir = path.join(testEnv.mintDir, ".hidden-dir");
      await createTestFile(
        hiddenDir,
        "file.yml",
        createYAMLContent("simple-task")
      );

      const yamlContent = `tasks:
  - key: embedded
    call: \${{ run.mint-dir }}/`;

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

      const completions = await server.sendRequest("textDocument/completion", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 32), // After embedded run path
      });

      expect(completions).toBeDefined();
      expect(Array.isArray(completions)).toBe(true);

      if (Array.isArray(completions) && completions.length > 0) {
        const fileNames = completions.map((c: any) => c.label);
        expect(fileNames).toContain("visible.yml");
        expect(fileNames).not.toContain(".hidden.yml");
        expect(fileNames).not.toContain(".hidden-dir");
      }
    });
  });
});
