import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestLanguageServer } from "./test-helpers/test-server";
import {
  createTestEnvironment,
  createTestFile,
} from "./test-helpers/test-utils";
import {
  Hover,
  MarkupContent,
  MarkupKind,
  Position,
} from "vscode-languageserver-protocol";
import assert from "node:assert";

describe("Hover Provider", () => {
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

  describe("Package Hover Information", () => {
    it("provides hover information for package calls", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: rwx/greeting 1.0.5
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

      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 12),
      });

      assert(hover);
      const contents = hover.contents as MarkupContent;

      expect(contents).toBeDefined();
      expect(contents.value).toMatchInlineSnapshot(`
        "**rwx/greeting** v1.0.5

        Says hello, for testing and demonstration purposes

        **Source Code:** https://github.com/rwx-cloud/packages/tree/main/rwx/greeting

        **Issues:** https://github.com/rwx-cloud/packages/issues

        **Parameters:**
        - \`name\` **(required)**: Name to greet"
      `);
    });

    it("returns null for non-package contexts", async () => {
      const yamlContent = `tasks:
  - key: build
    run: npm run build
  - key: test
    use: build`;

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

      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 9),
      });

      expect(hover).toBe(null);
    });

    it("handles API failures gracefully", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: nonexistent/package 1.0.0`;

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

      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 15),
      });

      expect(hover).toBe(null);
    });
  });

  describe("Parameter Hover Information", () => {
    it("provides hover information for package parameters", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: rwx/greeting 1.0.5
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

      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(4, 10),
      });
      const contents = hover.contents as MarkupContent;

      expect(contents).toBeDefined();
      expect(contents.value).toMatchInlineSnapshot(`
        "**name**
        *Required parameter*

        Name to greet"
      `);
    });

    it("handles missing package details gracefully", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: nonexistent/package 1.0.0
    with:
      param: value`;

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

      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(4, 6),
      });

      expect(hover).toBe(null);
    });
  });

  describe("Alias Hover Information", () => {
    it("provides hover information for aliases", async () => {
      const yamlContent = `aliases:
  my-alias: &my-alias "abc"

tasks:
  - key: deploy
    run: *my-alias`;

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

      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(5, 11),
      });

      assert(hover);
      const contents = hover.contents as MarkupContent;

      expect(contents).toBeDefined();
      expect(contents.value).toMatchInlineSnapshot(`
        "**YAML Alias: \`*my-alias\`**

        \`\`\`yaml
        "abc"
        \`\`\`"
      `);
    });
  });

  describe("Non-RWX Files", () => {
    it("returns null for files outside .mint/.rwx directories", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: rwx/greeting 1.0.5`;

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

      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 15),
      });

      expect(hover).toBe(null);
    });
  });
});
