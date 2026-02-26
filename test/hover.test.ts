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

  describe("YAML Key Hover Documentation", () => {
    it("provides hover for a top-level key", async () => {
      const yamlContent = `tasks:
  - key: build
    run: echo hi`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "top-level.yml",
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
        position: Position.create(0, 2),
      });

      assert(hover);
      const contents = hover.contents as MarkupContent;
      expect(contents.kind).toBe(MarkupKind.Markdown);
      expect(contents.value).toContain("**`tasks`**");
      expect(contents.value).toContain("task definitions");
    });

    it("provides hover for a task property key", async () => {
      const yamlContent = `tasks:
  - key: build
    run: echo hi`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "task-prop.yml",
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
        position: Position.create(2, 5),
      });

      assert(hover);
      const contents = hover.contents as MarkupContent;
      expect(contents.kind).toBe(MarkupKind.Markdown);
      expect(contents.value).toContain("**`run`**");
      expect(contents.value).toContain("shell command");
    });

    it("provides hover for a nested key under agent", async () => {
      const yamlContent = `tasks:
  - key: build
    agent:
      memory: 16gb`;

      const filePath = await createTestFile(
        testEnv.mintDir,
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

      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(3, 8),
      });

      assert(hover);
      const contents = hover.contents as MarkupContent;
      expect(contents.kind).toBe(MarkupKind.Markdown);
      expect(contents.value).toContain("**`memory`**");
      expect(contents.value).toContain("memory allocation");
    });

    it("provides hover for a base layer key", async () => {
      const yamlContent = `base:
  image: ubuntu:24.04
tasks:
  - key: build
    run: echo hi`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "base-layer.yml",
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
        position: Position.create(1, 3),
      });

      assert(hover);
      const contents = hover.contents as MarkupContent;
      expect(contents.kind).toBe(MarkupKind.Markdown);
      expect(contents.value).toContain("**`image`**");
      expect(contents.value).toContain("Docker image");
    });

    it("does not provide hover when cursor is on a value", async () => {
      const yamlContent = `tasks:
  - key: build
    run: echo hi`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "no-value-hover.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Position after the colon on "run: echo hi" — on the value
      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 10),
      });

      expect(hover).toBe(null);
    });

    it("combines key description with package hover on call line", async () => {
      const yamlContent = `tasks:
  - key: deploy
    call: rwx/greeting 1.0.5
    with:
      name: "my-name"`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "combined.yml",
        yamlContent
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlContent,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Hover on the "call" key itself
      const hover = await server.sendRequest<Hover>("textDocument/hover", {
        textDocument: { uri: textDocument.uri },
        position: Position.create(2, 5),
      });

      assert(hover);
      const contents = hover.contents as MarkupContent;
      // Should have both the key description and the package info
      expect(contents.value).toContain("**`call`**");
      expect(contents.value).toContain("rwx/greeting");
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
