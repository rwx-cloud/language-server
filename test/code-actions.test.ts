import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestLanguageServer } from "./test-helpers/test-server";
import {
  createTestEnvironment,
  createTestFile,
} from "./test-helpers/test-utils";
import {
  CodeAction,
  CodeActionKind,
  Range,
  Position,
} from "vscode-languageserver-protocol";

describe("Code Actions Provider", () => {
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

  describe("Package Version Update Actions", () => {
    it("provides update action for outdated package versions", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: rwx/greeting 1.0.4
    with:
      name: "my-name"`;

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

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const range = Range.create(
        Position.create(2, 11),
        Position.create(2, 30)
      );

      const codeActions = await server.sendRequest<CodeAction[]>(
        "textDocument/codeAction",
        {
          textDocument: { uri: textDocument.uri },
          range: range,
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
        }
      );

      expect(codeActions).toHaveLength(1);
      expect(codeActions[0]?.kind).toBe("quickfix");
      expect(codeActions[0]?.title).toContain("Update to latest version");
    });

    it("creates correct text edit for version update", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: rwx/greeting 1.0.4
    with:
      name: "my-name"`;

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

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const range = Range.create(
        Position.create(2, 11),
        Position.create(2, 30)
      );

      const codeActions = await server.sendRequest<CodeAction[]>(
        "textDocument/codeAction",
        {
          textDocument: { uri: textDocument.uri },
          range: range,
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
        }
      );

      expect(codeActions).toHaveLength(1);

      const codeAction = codeActions[0];
      expect(codeAction).toBeDefined();

      const changes = codeAction.edit!.changes?.[textDocument.uri];
      expect(changes).toBeDefined();
      expect(changes).toHaveLength(1);

      const edit = changes![0];
      expect(edit.newText).toMatch(/\d+\.\d+\.\d+/);

      const lines = yamlContent.split("\n");
      const line = lines[edit.range.start.line];
      const updatedLine =
        line.substring(0, edit.range.start.character) +
        edit.newText +
        line.substring(edit.range.end.character);

      expect(updatedLine).toEqual(`    call: rwx/greeting ${edit.newText}`);
    });

    it("returns empty array when package is up to date", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: nonexistent/package 999.999.999`;

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

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const range = Range.create(
        Position.create(2, 30),
        Position.create(2, 41)
      );

      const codeActions = await server.sendRequest<CodeAction[]>(
        "textDocument/codeAction",
        {
          textDocument: { uri: textDocument.uri },
          range: range,
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
        }
      );

      expect(codeActions).toBeDefined();
      expect(codeActions).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    it("handles malformed YAML gracefully", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: rwx/greeting 1.0.4
    run: echo "missing quote`;

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

      const range = Range.create(
        Position.create(2, 11),
        Position.create(2, 30)
      );

      const codeActions = await server.sendRequest<CodeAction[]>(
        "textDocument/codeAction",
        {
          textDocument: { uri: textDocument.uri },
          range: range,
          context: {
            diagnostics: [],
            only: [CodeActionKind.QuickFix],
          },
        }
      );

      expect(codeActions).toHaveLength(1);
    });
  });
});
