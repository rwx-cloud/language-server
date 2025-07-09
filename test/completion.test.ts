import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestLanguageServer } from "./test-helpers/test-server";
import {
  createTestEnvironment,
  createTestFile,
  createYAMLContent,
} from "./test-helpers/test-utils";
import {
  CompletionItem,
  CompletionItemKind,
  Position,
} from "vscode-languageserver-protocol";
import * as path from "path";
import assert from "assert";

describe("Completion Provider", () => {
  let server: TestLanguageServer;
  let testEnv: {
    rootDir: string;
    mintDir: string;
    cleanup: () => Promise<void>;
  };

  beforeEach(async () => {
    server = new TestLanguageServer();
    await server.start();

    server.onRequest("client/registerCapability", () => null);
    server.onRequest("workspace/configuration", () => [
      {
        maxNumberOfProblems: 1000,
      },
    ]);

    await server.initialize();

    testEnv = await createTestEnvironment("mint");
  });

  afterEach(async () => {
    await server.stop();
    await testEnv.cleanup();
  });

  describe("Task Completion", () => {
    it("provides task completions in simple use context", async () => {
      const yamlContent = `
tasks:
  - key: build
    run: npm run build
  - key: test
    run: npm test
  - key: deploy
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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(7, 10),
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "task-0",
            "detail": "Task dependency",
            "documentation": "Reference to task "build"",
            "insertText": "build",
            "kind": 18,
            "label": "build",
          },
          {
            "data": "task-1",
            "detail": "Task dependency",
            "documentation": "Reference to task "test"",
            "insertText": "test",
            "kind": 18,
            "label": "test",
          },
        ]
      `);
    });

    it("provides task completions in array use context", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    run: npm test
  - key: lint
    run: npm run lint
  - key: deploy
    use: []`;

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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(8, 10), // between `[` and `]`
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "task-0",
            "detail": "Task dependency",
            "documentation": "Reference to task "build"",
            "insertText": "build",
            "kind": 18,
            "label": "build",
          },
          {
            "data": "task-1",
            "detail": "Task dependency",
            "documentation": "Reference to task "test"",
            "insertText": "test",
            "kind": 18,
            "label": "test",
          },
          {
            "data": "task-2",
            "detail": "Task dependency",
            "documentation": "Reference to task "lint"",
            "insertText": "lint",
            "kind": 18,
            "label": "lint",
          },
        ]
      `);
    });

    it("provides task completions in array use context without closing bracket", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    run: npm test
  - key: lint
    run: npm run lint
  - key: deploy
    use: [`;

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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(8, 10), // after `[`
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "task-0",
            "detail": "Task dependency",
            "documentation": "Reference to task "build"",
            "insertText": "build",
            "kind": 18,
            "label": "build",
          },
          {
            "data": "task-1",
            "detail": "Task dependency",
            "documentation": "Reference to task "test"",
            "insertText": "test",
            "kind": 18,
            "label": "test",
          },
          {
            "data": "task-2",
            "detail": "Task dependency",
            "documentation": "Reference to task "lint"",
            "insertText": "lint",
            "kind": 18,
            "label": "lint",
          },
        ]
      `);
    });

    it("provides task completions in multi-line array use context with closing bracket", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    run: npm test
  - key: lint
    run: npm run lint
  - key: deploy
    use: [
      task-1,
      task-2,
    ]`;

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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(10, 6), // after "task-2," on line with comma
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "task-0",
            "detail": "Task dependency",
            "documentation": "Reference to task "build"",
            "insertText": "build",
            "kind": 18,
            "label": "build",
          },
          {
            "data": "task-1",
            "detail": "Task dependency",
            "documentation": "Reference to task "test"",
            "insertText": "test",
            "kind": 18,
            "label": "test",
          },
          {
            "data": "task-2",
            "detail": "Task dependency",
            "documentation": "Reference to task "lint"",
            "insertText": "lint",
            "kind": 18,
            "label": "lint",
          },
        ]
      `);
    });

    it("provides task completions in multi-line array use context without closing bracket", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    run: npm test
  - key: lint
    run: npm run lint
  - key: deploy
    use: [
      task-1,
      task-2,`;

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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(10, 14), // after "task-2," at end of line
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "task-0",
            "detail": "Task dependency",
            "documentation": "Reference to task "build"",
            "insertText": "build",
            "kind": 18,
            "label": "build",
          },
          {
            "data": "task-1",
            "detail": "Task dependency",
            "documentation": "Reference to task "test"",
            "insertText": "test",
            "kind": 18,
            "label": "test",
          },
          {
            "data": "task-2",
            "detail": "Task dependency",
            "documentation": "Reference to task "lint"",
            "insertText": "lint",
            "kind": 18,
            "label": "lint",
          },
        ]
      `);
    });

    it("filters out tasks without keys", async () => {
      const yamlContent = `
tasks:
  - key: valid-task
    run: echo valid
  - run: echo no-key
  - key: another-valid
    run: echo another
  - use:
`;

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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(7, 8),
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "task-0",
            "detail": "Task dependency",
            "documentation": "Reference to task "valid-task"",
            "insertText": "valid-task",
            "kind": 18,
            "label": "valid-task",
          },
          {
            "data": "task-1",
            "detail": "Task dependency",
            "documentation": "Reference to task "another-valid"",
            "insertText": "another-valid",
            "kind": 18,
            "label": "another-valid",
          },
        ]
      `);
    });
  });

  describe("Package Completion", () => {
    it("provides package completions in call context", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: `;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "package.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(2, 9),
        }
      );

      expect(completions.length).toBeGreaterThan(40);
      const firstPackage = completions[0];
      assert(firstPackage);
      expect(firstPackage.data).toBe("package-0");
      expect(firstPackage.detail).toMatch(/^v\d+\.\d+.\d+$/);
      expect(firstPackage.insertText).toMatch(/^.+\/.+ \d+\.\d+.\d$/);
      expect(firstPackage.kind).toBe(9);
      expect(firstPackage.label).toMatch(/^.+\/.+$/);
    });

    it("excludes completions in embedded run context", async () => {
      const yamlContent = `
tasks:
  - key: embedded
    call: \${{ run.mint-dir }}/`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "embedded.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(3, 32),
        }
      );

      expect(completions).toBeDefined();
      expect(completions).toHaveLength(0);
    });
  });

  describe("File Path Completion", () => {
    it("provides file completions for embedded run calls", async () => {
      await createTestFile(
        testEnv.mintDir,
        "workflow1.yml",
        createYAMLContent("simple-task")
      );
      await createTestFile(
        testEnv.mintDir,
        "workflow2.yml",
        createYAMLContent("simple-task")
      );

      const subDir = path.join(testEnv.mintDir, "shared");
      await createTestFile(
        subDir,
        "common.yml",
        createYAMLContent("simple-task")
      );

      const yamlContent = `
tasks:
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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(3, 32),
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "dir-shared",
            "detail": "Directory",
            "insertText": "shared/",
            "kind": 19,
            "label": "shared",
          },
          {
            "data": "file-workflow1.yml",
            "detail": "RWX run definition file",
            "insertText": "workflow1.yml",
            "kind": 17,
            "label": "workflow1.yml",
          },
          {
            "data": "file-workflow2.yml",
            "detail": "RWX run definition file",
            "insertText": "workflow2.yml",
            "kind": 17,
            "label": "workflow2.yml",
          },
        ]
      `);
    });

    it("completes only YAML files", async () => {
      await createTestFile(
        testEnv.mintDir,
        "workflow.yml",
        createYAMLContent("simple-task")
      );
      await createTestFile(
        testEnv.mintDir,
        "workflow.yaml",
        createYAMLContent("simple-task")
      );
      await createTestFile(testEnv.mintDir, "readme.txt", "Not a YAML file");
      await createTestFile(testEnv.mintDir, "package.json", '{"name": "test"}');

      const yamlContent = `
tasks:
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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(3, 32),
        }
      );

      expect(completions).toBeDefined();

      const fileNames = completions.map((c) => c.label);
      expect(fileNames).toContain("workflow.yml");
      expect(fileNames).toContain("workflow.yaml");
      expect(fileNames).not.toContain("readme.txt");
      expect(fileNames).not.toContain("package.json");
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

      const yamlContent = `
tasks:
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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(3, 32),
        }
      );

      expect(completions).toBeDefined();

      const fileNames = completions.map((c) => c.label);
      expect(fileNames).toContain("visible.yml");
      expect(fileNames).not.toContain(".hidden.yml");
      expect(fileNames).not.toContain(".hidden-dir");
    });

    it("excludes current file to prevent circular references", async () => {
      await createTestFile(
        testEnv.mintDir,
        "other.yml",
        createYAMLContent("simple-task")
      );

      const yamlContent = `
tasks:
  - key: embedded
    call: \${{ run.mint-dir }}/`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "self-reference.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(3, 32),
        }
      );

      expect(completions).toBeDefined();

      const fileNames = completions.map((c) => c.label);
      expect(fileNames).toContain("other.yml");
      expect(fileNames).not.toContain("self-reference.yml");
    });

    it("handles non-existent directories gracefully", async () => {
      const yamlContent = `
tasks:
  - key: embedded
    call: \${{ run.mint-dir }}/non-existent/`;

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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(3, 46),
        }
      );

      expect(completions).toBeDefined();
      expect(completions).toHaveLength(0);
    });

    it("provides completions at ${{ run.mint-dir }} without slash", async () => {
      await createTestFile(
        testEnv.mintDir,
        "workflow.yml",
        createYAMLContent("simple-task")
      );

      const yamlContent = `
tasks:
  - key: embedded
    call: \${{ run.mint-dir }}`;

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

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(3, 31),
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "file-workflow.yml",
            "detail": "RWX run definition file",
            "insertText": "workflow.yml",
            "kind": 17,
            "label": "workflow.yml",
          },
        ]
      `);
    });
  });

  describe("Parameter Completion", () => {
    it("provides parameter completions in with context", async () => {
      const yamlContent = `
tasks:
  - key: deploy
    call: rwx/greeting 1.0.5
    with:
      `;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "params.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(5, 6),
        }
      );

      expect(completions).toMatchInlineSnapshot(`
        [
          {
            "data": "param-0",
            "detail": "required",
            "documentation": "Name to greet",
            "insertText": "name: ",
            "kind": 10,
            "label": "name",
          },
        ]
      `);
    });

    it("handles missing package details gracefully", async () => {
      const yamlContent = `
tasks:
  - key: deploy
    call: nonexistent/package 1.0.0
    with:
      `;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "params.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const completions = await server.sendRequest<CompletionItem[]>(
        "textDocument/completion",
        {
          textDocument: { uri: textDocument.uri },
          position: Position.create(5, 6),
        }
      );

      expect(completions).toBeDefined();
      expect(completions).toHaveLength(0);
    });
  });
});
