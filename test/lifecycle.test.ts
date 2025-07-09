import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestLanguageServer } from "./test-helpers/test-server";
import {
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver-protocol";

describe("LSP Server Lifecycle and Configuration", () => {
  let server: TestLanguageServer;

  beforeEach(async () => {
    server = new TestLanguageServer();
    await server.start();

    // Set up default handlers for common client requests
    server.onRequest("client/registerCapability", () => null);
    server.onRequest("workspace/configuration", () => [
      {
        maxNumberOfProblems: 1000,
      },
    ]);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe("Connection Initialization", () => {
    it("initializes with full feature capabilities when client supports all features", async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          workspace: {
            configuration: true,
            workspaceFolders: true,
          },
        },
        workspaceFolders: null,
      };

      const result = await server.sendRequest<InitializeResult>(
        "initialize",
        params
      );

      expect(result.capabilities).toBeDefined();
      expect(result.capabilities.textDocumentSync).toBe(
        TextDocumentSyncKind.Incremental
      );
      expect(result.capabilities.completionProvider).toEqual({
        resolveProvider: true,
        triggerCharacters: [" ", "[", ",", ":", "\n", "/"],
      });
      expect(result.capabilities.diagnosticProvider).toEqual({
        interFileDependencies: false,
        workspaceDiagnostics: false,
      });
      expect(result.capabilities.definitionProvider).toBe(true);
      expect(result.capabilities.hoverProvider).toBe(true);
      expect(result.capabilities.referencesProvider).toBe(true);
      expect(result.capabilities.codeActionProvider).toEqual({
        codeActionKinds: ["quickfix"],
      });
      expect(result.capabilities.workspace?.workspaceFolders).toEqual({
        supported: true,
      });
    });

    it("initializes with limited capabilities when client has no configuration support", async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          // No workspace capabilities
        },
        workspaceFolders: null,
      };

      const result = await server.sendRequest<InitializeResult>(
        "initialize",
        params
      );

      expect(result.capabilities).toBeDefined();
      expect(result.capabilities.textDocumentSync).toBe(
        TextDocumentSyncKind.Incremental
      );
      expect(result.capabilities.workspace?.workspaceFolders).toBeUndefined();
    });

    it("initializes with workspace folder support when client supports it", async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          workspace: {
            workspaceFolders: true,
          },
        },
        workspaceFolders: [
          {
            uri: "file:///test/workspace",
            name: "Test Workspace",
          },
        ],
      };

      const result = await server.sendRequest<InitializeResult>(
        "initialize",
        params
      );

      expect(result.capabilities.workspace?.workspaceFolders).toEqual({
        supported: true,
      });
    });

    it("registers for configuration changes after initialization", async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          workspace: {
            configuration: true,
          },
        },
        workspaceFolders: null,
      };

      await server.sendRequest<InitializeResult>("initialize", params);

      // Send initialized notification
      server.sendNotification("initialized", {});

      // Give server time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send configuration change notification
      server.sendNotification("workspace/didChangeConfiguration", {
        settings: {
          rwxLanguageServer: {
            maxNumberOfProblems: 500,
          },
        },
      });

      // No error should occur
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("handles workspace folder change events when supported", async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          workspace: {
            workspaceFolders: true,
          },
        },
        workspaceFolders: [
          {
            uri: "file:///test/workspace",
            name: "Test Workspace",
          },
        ],
      };

      await server.sendRequest<InitializeResult>("initialize", params);
      server.sendNotification("initialized", {});

      // Send workspace folder change
      server.sendNotification("workspace/didChangeWorkspaceFolders", {
        event: {
          added: [
            {
              uri: "file:///test/workspace2",
              name: "Test Workspace 2",
            },
          ],
          removed: [],
        },
      });

      // No error should occur
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe("Settings Management", () => {
    it("handles documents when configuration capability is not supported", async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          // No configuration support
        },
        workspaceFolders: null,
      };

      await server.sendRequest<InitializeResult>("initialize", params);
      server.sendNotification("initialized", {});

      // Open a document and request diagnostics - should work with default settings
      const textDocument = {
        uri: "file:///test/.mint/test.yml",
        languageId: "yaml",
        version: 1,
        text: "tasks:\n  - key: test\n    run: echo test",
      };

      server.sendNotification("textDocument/didOpen", {
        textDocument,
      });

      const diagnostics: any = await server.sendRequest(
        "textDocument/diagnostic",
        {
          textDocument: {
            uri: textDocument.uri,
          },
        }
      );

      expect(diagnostics).toBeDefined();
      expect((diagnostics as any).kind).toBe("full");
      expect(diagnostics.items).toBeInstanceOf(Array);
    });

    it("handles configuration changes when supported", async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          workspace: {
            configuration: true,
          },
        },
        workspaceFolders: null,
      };

      // Set up handler for configuration requests
      server.onRequest("workspace/configuration", () => {
        return [
          {
            maxNumberOfProblems: 500,
          },
        ];
      });

      await server.sendRequest<InitializeResult>("initialize", params);
      server.sendNotification("initialized", {});

      // Test that configuration changes don't crash the server
      server.sendNotification("workspace/didChangeConfiguration", {
        settings: {
          rwxLanguageServer: {
            maxNumberOfProblems: 500,
          },
        },
      });

      // Give server time to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Server should still be responsive
      const textDocument = {
        uri: "file:///test/.mint/test.yml",
        languageId: "yaml",
        version: 1,
        text: "tasks:\n  - key: test\n    run: echo test",
      };

      server.sendNotification("textDocument/didOpen", {
        textDocument,
      });

      const diagnostics = await server.sendRequest("textDocument/diagnostic", {
        textDocument: {
          uri: textDocument.uri,
        },
      });

      expect(diagnostics).toBeDefined();
      expect((diagnostics as any).kind).toBe("full");
    });

    it("removes settings for closed documents", async () => {
      const params: InitializeParams = {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          workspace: {
            configuration: true,
          },
        },
        workspaceFolders: null,
      };

      await server.sendRequest<InitializeResult>("initialize", params);
      server.sendNotification("initialized", {});

      const textDocument = {
        uri: "file:///test/.mint/test.yml",
        languageId: "yaml",
        version: 1,
        text: "tasks:\n  - key: test\n    run: echo test",
      };

      // Open and then close document
      server.sendNotification("textDocument/didOpen", {
        textDocument,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      server.sendNotification("textDocument/didClose", {
        textDocument: {
          uri: textDocument.uri,
        },
      });

      // No error should occur
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe("Server Lifecycle", () => {
    it("handles shutdown request correctly", async () => {
      await server.initialize();

      const result = await server.sendRequest("shutdown");
      expect(result).toBe(null);
    });

    it("exits cleanly on exit notification", async () => {
      await server.initialize();
      await server.sendRequest("shutdown");

      // Send exit notification
      server.sendNotification("exit");

      // Server should exit cleanly
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });
});
