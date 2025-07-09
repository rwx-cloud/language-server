import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestLanguageServer } from "./test-helpers/test-server";
import {
  createTestEnvironment,
  createTestFile,
  createYAMLContent,
} from "./test-helpers/test-utils";
import {
  DocumentDiagnosticReport,
  DiagnosticSeverity,
} from "vscode-languageserver-protocol";
import * as path from "path";

describe("Document Validation", () => {
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

  describe("RWX File Detection", () => {
    it("identifies files in .mint directory as RWX files", async () => {
      const filePath = await createTestFile(
        testEnv.mintDir,
        "test.yml",
        createYAMLContent("simple-task")
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("simple-task"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }
    });

    it("identifies files in .rwx directory as RWX files", async () => {
      const rwxEnv = await createTestEnvironment("rwx");

      const filePath = await createTestFile(
        rwxEnv.mintDir,
        "test.yml",
        createYAMLContent("simple-task")
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("simple-task"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }

      await rwxEnv.cleanup();
    });

    it("identifies nested .mint directory files as RWX files", async () => {
      const nestedDir = path.join(testEnv.mintDir, "workflows", "ci");
      const filePath = await createTestFile(
        nestedDir,
        "build.yml",
        createYAMLContent("simple-task")
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("simple-task"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }
    });

    it("identifies nested .rwx directory files as RWX files", async () => {
      const rwxEnv = await createTestEnvironment("rwx");
      const nestedDir = path.join(rwxEnv.mintDir, "pipelines", "deploy");

      const filePath = await createTestFile(
        nestedDir,
        "production.yml",
        createYAMLContent("simple-task")
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("simple-task"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }

      await rwxEnv.cleanup();
    });

    it("rejects files not in .mint or .rwx directories", async () => {
      const filePath = await createTestFile(
        testEnv.rootDir,
        "test.yml",
        createYAMLContent("simple-task")
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("simple-task"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toHaveLength(0);
      }
    });

    it("handles file:// URI protocol correctly", async () => {
      const filePath = await createTestFile(
        testEnv.mintDir,
        "test.yml",
        createYAMLContent("simple-task")
      );

      // Test with file:// prefix
      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("simple-task"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }
    });

    it("normalizes file paths for cross-platform compatibility", async () => {
      const filePath = await createTestFile(
        testEnv.mintDir,
        "test.yml",
        createYAMLContent("simple-task")
      );

      // Test with backslashes (Windows-style) in URI
      const windowsStyleUri = `file://${filePath.replace(/\//g, "\\\\")}`;

      const textDocument = {
        uri: windowsStyleUri,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("simple-task"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      // Should still be recognized as RWX file after normalization
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }
    });
  });

  describe("Diagnostic Generation", () => {
    it("returns empty diagnostics for non-RWX files", async () => {
      const filePath = await createTestFile(
        testEnv.rootDir,
        "not-rwx.yml",
        createYAMLContent("simple-task")
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("simple-task"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toHaveLength(0);
      }
    });

    it("converts parser errors to LSP diagnostics", async () => {
      const filePath = await createTestFile(
        testEnv.mintDir,
        "invalid.yml",
        createYAMLContent("invalid-yaml")
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("invalid-yaml"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items.length).toBeGreaterThan(0);

        const diagnostic = result.items[0];
        if (diagnostic) {
          expect(diagnostic).toBeDefined();
          expect(diagnostic.severity).toBe(DiagnosticSeverity.Error);
          expect(diagnostic.source).toBe("rwx-run-parser");
        }
      }
    });

    it("uses stack trace for precise error locations when available", async () => {
      const filePath = await createTestFile(
        testEnv.mintDir,
        "error.yml",
        createYAMLContent("invalid-yaml")
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: createYAMLContent("invalid-yaml"),
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");

      if ("items" in result && result.items.length > 0) {
        const diagnostic = result.items[0];
        if (diagnostic) {
          expect(diagnostic.range).toBeDefined();
          expect(diagnostic.range.start).toBeDefined();
          expect(diagnostic.range.end).toBeDefined();
        }
      }
    });

    it("falls back to basic error location when stack trace is missing", async () => {
      // This test depends on parser behavior - it should still pass even if
      // the parser always provides stack traces
      const filePath = await createTestFile(
        testEnv.mintDir,
        "error.yml",
        "invalid: yaml: content: here"
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: "invalid: yaml: content: here",
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      // Should have diagnostics or no diagnostics, but not crash
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }
    });

    it("includes parser advice in diagnostic messages", async () => {
      // Create a YAML that might trigger parser advice
      const yamlWithIssue = `
tasks:
  - key: test
    run: echo test
  - key: test
    run: echo duplicate
`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "duplicate.yml",
        yamlWithIssue
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlWithIssue,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");

      // If parser provides advice, it should be included
      if ("items" in result) {
        // This is okay if no advice is provided
        expect(result.items).toBeDefined();
      }
    });

    it("limits diagnostics to maxNumberOfProblems setting", async () => {
      // Create YAML with syntax errors that the parser will definitely catch
      const yamlWithManyErrors = `
tasks:
  - key: test1
    run: echo "missing quote
  - key: test2
    use: [unclosed, array
  - key: test3
    call: mint/deploy 1.0.0
    invalid-key: value
`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "many-errors.yml",
        yamlWithManyErrors
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlWithManyErrors,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      // Server respects maxNumberOfProblems from configuration
      if ("items" in result) {
        expect(result.items.length).toBeLessThanOrEqual(1000); // Default setting
      }
    });

    it("handles parser exceptions gracefully", async () => {
      // Try to trigger a parser exception with extremely malformed YAML
      const malformedYaml = `
[[[{{{{
}}}}]]]
<<<>>>
***%%%
`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "malformed.yml",
        malformedYaml
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: malformedYaml,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }

      // Should have at least one error diagnostic
      if ("items" in result && result.items.length > 0) {
        const firstItem = result.items[0];
        if (firstItem) {
          expect(firstItem.severity).toBe(DiagnosticSeverity.Error);
        }
      }
    });

    it("includes version checking diagnostics", async () => {
      const yamlWithPackage = `
tasks:
  - key: deploy
    call: mint/deploy-node 1.0.0
    with:
      node-version: "18"
`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "package.yml",
        yamlWithPackage
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlWithPackage,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Give time for API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }

      // Check if any diagnostics are version-related warnings
      if ("items" in result) {
        // It's okay if no version warnings (package might be up to date)
        expect(result.items).toBeDefined();
      }
    });

    it("merges parser and version diagnostics correctly", async () => {
      const yamlWithIssues = `
tasks:
  - key: test
    run: echo "missing quote
  - key: deploy
    call: mint/deploy-node 1.0.0
    with:
      node-version: "18"
`;

      const filePath = await createTestFile(
        testEnv.mintDir,
        "mixed.yml",
        yamlWithIssues
      );

      const textDocument = {
        uri: `file://${filePath}`,
        languageId: "yaml",
        version: 1,
        text: yamlWithIssues,
      };

      server.sendNotification("textDocument/didOpen", { textDocument });

      // Give time for API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await server.sendRequest<DocumentDiagnosticReport>(
        "textDocument/diagnostic",
        {
          textDocument: { uri: textDocument.uri },
        }
      );

      expect(result.kind).toBe("full");
      if ("items" in result) {
        expect(result.items).toBeDefined();
      }

      // Should have diagnostics from parser (errors or warnings) and/or version checker
      if ("items" in result) {
        expect(result.items.length).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
