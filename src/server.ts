import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  DocumentDiagnosticReportKind,
  type DocumentDiagnosticReport,
  LocationLink,
  Range,
  Position,
  Hover,
  MarkupKind,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  TextEdit,
  Location,
  ReferenceParams,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import * as path from "path";
import * as fs from "fs";
import { YamlParser } from "../support/parser";

// RWX Package types
interface RWXPackage {
  version: string;
  description: string;
}

interface RWXPackagesResponse {
  [packageName: string]: RWXPackage;
}

// Detailed package info from version endpoint
interface RWXPackageParameter {
  name: string;
  required: boolean | null;
  default: string;
  description: string;
}

interface RWXPackageDetails {
  name: string;
  version: string;
  readme: string;
  digest: string;
  published: boolean;
  description: string;
  source_code_url: string;
  issue_tracker_url: string;
  parameters: RWXPackageParameter[];
}

const USER_AGENT = "rwx-language-server/1";

// Package cache - cache for 1 hour
const packageCache: { data: RWXPackagesResponse | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};

// Package details cache - cache indefinitely
const packageDetailsCache: Map<string, RWXPackageDetails> = new Map();

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Fetch RWX packages from the API
async function fetchRWXPackages(): Promise<RWXPackagesResponse | null> {
  const now = Date.now();

  // Return cached data if it's still valid
  if (packageCache.data && now - packageCache.timestamp < CACHE_DURATION) {
    return packageCache.data;
  }

  try {
    const response = await fetch(
      "https://cloud.rwx.com/mint/api/leaves/documented",
      {
        headers: {
          Accept: "application/json,*/*",
          "User-Agent": USER_AGENT,
        },
      }
    );

    if (!response.ok) {
      console.error(
        "Failed to fetch RWX packages:",
        response.status,
        response.statusText
      );
      return packageCache.data; // Return cached data if available
    }

    const data = (await response.json()) as RWXPackagesResponse;

    // Update cache
    packageCache.data = data;
    packageCache.timestamp = now;

    return data;
  } catch (error) {
    console.error("Error fetching RWX packages:", error);
    return packageCache.data; // Return cached data if available
  }
}

// Fetch detailed package information for a specific version
async function fetchPackageDetails(
  packageName: string,
  version: string
): Promise<RWXPackageDetails | null> {
  const cacheKey = `${packageName}@${version}`;

  // Return cached data if available
  if (packageDetailsCache.has(cacheKey)) {
    return packageDetailsCache.get(cacheKey)!;
  }

  try {
    const url = `https://cloud.rwx.com/mint/api/leaves/${packageName}/${encodeURIComponent(
      version
    )}/documentation`;
    console.log("Fetching package details from:", url); // Debug logging

    const response = await fetch(url, {
      headers: {
        Accept: "application/json,*/*",
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      console.error(
        "Failed to fetch package details:",
        response.status,
        response.statusText,
        "URL:",
        url
      );
      return null;
    }

    const data = (await response.json()) as RWXPackageDetails;

    // Cache the result indefinitely
    packageDetailsCache.set(cacheKey, data);

    return data;
  } catch (error) {
    console.error("Error fetching package details:", error);
    return null;
  }
}

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: [" ", "[", ",", ":", "\n", "/"],
      },
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
      definitionProvider: true,
      hoverProvider: true,
      referencesProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    void connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      // Handle workspace folder changes
    });
  }
});

interface RwxLanguageServerSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
const defaultSettings: RwxLanguageServerSettings = {
  maxNumberOfProblems: 1000,
};
let globalSettings: RwxLanguageServerSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<
  string,
  Thenable<RwxLanguageServerSettings>
> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <RwxLanguageServerSettings>(
      ((change.settings as { rwxLanguageServer?: RwxLanguageServerSettings })
        .rwxLanguageServer || defaultSettings)
    );
  }

  // Configuration changes will automatically trigger diagnostic refresh
});

function getDocumentSettings(
  resource: string
): Thenable<RwxLanguageServerSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace
      .getConfiguration({
        scopeUri: resource,
        section: "rwxLanguageServer",
      })
      .then((config: unknown) => {
        // Ensure we have valid settings with defaults
        const typedConfig = config as { maxNumberOfProblems?: number } | null;
        return {
          maxNumberOfProblems:
            typedConfig?.maxNumberOfProblems ??
            defaultSettings.maxNumberOfProblems,
        };
      });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

// Check if document is in a .mint or .rwx directory
function isRwxRunFile(document: TextDocument): boolean {
  const filePath = document.uri.replace("file://", "");
  const normalizedPath = path.normalize(filePath);

  // Check if the file is in a .mint or .rwx directory anywhere in the path
  const pathParts = normalizedPath.split(path.sep);
  return pathParts.some((part) => part === ".mint" || part === ".rwx");
}

connection.languages.diagnostics.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (document !== undefined) {
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: await validateTextDocumentForDiagnostics(document),
    } satisfies DocumentDiagnosticReport;
  } else {
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: [],
    } satisfies DocumentDiagnosticReport;
  }
});

async function validateTextDocumentForDiagnostics(
  textDocument: TextDocument
): Promise<Diagnostic[]> {
  // Only validate YAML files in .mint or .rwx directories
  if (!isRwxRunFile(textDocument)) {
    return [];
  }

  let settings: RwxLanguageServerSettings;
  try {
    settings = await getDocumentSettings(textDocument.uri);
  } catch (error) {
    connection.console.error(
      `Failed to get document settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    settings = defaultSettings;
  }
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    // Parse the document using the Mint parser
    const snippets = new Map();
    const fileName = textDocument.uri.replace("file://", "");
    const result = await YamlParser.safelyParseRun(fileName, text, snippets);

    // Convert parser errors to diagnostics
    for (const error of result.errors) {
      // Get the most specific stack trace entry (usually the last one)
      const stackEntry = error.stackTrace?.[0];
      const line = stackEntry?.line ?? error.line ?? 1;
      const column = stackEntry?.column ?? error.column ?? 1;

      // Use end position from stack trace if available, otherwise fall back to approximation
      const startLine = line - 1; // Convert to 0-based
      const startChar = column - 1; // Convert to 0-based
      const endLine = stackEntry?.endLine ? stackEntry.endLine - 1 : startLine;
      const endChar = stackEntry?.endColumn
        ? stackEntry.endColumn - 1
        : startChar + 10;

      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: {
            line: startLine,
            character: startChar,
          },
          end: {
            line: endLine,
            character: endChar,
          },
        },
        message: error.message,
        source: "rwx-run-parser",
      };

      if (error.advice) {
        diagnostic.message += `\n\nAdvice: ${error.advice}`;
      }

      diagnostics.push(diagnostic);
    }

    // Add version checking diagnostics
    const versionDiagnostics = await checkPackageVersions(textDocument);
    diagnostics.push(...versionDiagnostics);

    // Limit the number of problems reported
    return diagnostics.slice(0, settings.maxNumberOfProblems);
  } catch (error) {
    // If there's an error in parsing, create a generic diagnostic
    return [
      {
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        message: `Parser error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        source: "rwx-run-parser",
      },
    ];
  }
}

// Helper function to extract task keys from parsed result
function extractTaskKeys(result: any): string[] {
  if (!result?.partialRunDefinition?.tasks) {
    return [];
  }

  return result.partialRunDefinition.tasks
    .map((task: any) => task.key)
    .filter((key: string) => key && typeof key === "string" && key !== "#fake");
}

// Helper function to find task definition location in document
function findTaskDefinition(
  document: TextDocument,
  taskKey: string
): Position | null {
  const lines = document.getText().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Look for "- key: taskKey" or "  key: taskKey" patterns
    const keyPattern = new RegExp(
      `^\\s*(?:-\\s+)?key:\\s*['"]?${escapeRegExp(taskKey)}['"]?\\s*$`
    );
    if (keyPattern.test(line)) {
      const keyIndex = line.indexOf(taskKey);
      if (keyIndex !== -1) {
        return Position.create(i, keyIndex);
      }
    }
  }

  return null;
}

// Helper function to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper function to find the parent .mint or .rwx directory
function findMintDirectory(filePath: string): string | null {
  let currentDir = path.dirname(filePath);

  while (currentDir !== path.dirname(currentDir)) {
    // Stop at filesystem root
    const dirName = path.basename(currentDir);
    if (dirName === ".mint" || dirName === ".rwx") {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

// Helper function to get file and directory completions from a directory
async function getFileCompletions(
  baseDir: string,
  relativePath: string = "",
  currentFilePath: string = ""
): Promise<CompletionItem[]> {
  try {
    const searchDir = path.join(baseDir, relativePath);

    // Check if the directory exists
    if (!fs.existsSync(searchDir) || !fs.statSync(searchDir).isDirectory()) {
      return [];
    }

    const entries = fs.readdirSync(searchDir, { withFileTypes: true });
    const completions: CompletionItem[] = [];

    for (const entry of entries) {
      // Skip hidden files and directories (starting with .)
      if (entry.name.startsWith(".")) {
        continue;
      }

      if (entry.isDirectory()) {
        completions.push({
          label: entry.name,
          kind: CompletionItemKind.Folder,
          detail: "Directory",
          insertText: `${entry.name}/`,
          data: `dir-${entry.name}`,
        });
      } else if (entry.isFile()) {
        // Only include YAML files for RWX run definitions
        if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
          const fullPath = path.join(searchDir, entry.name);

          // Skip the current file to avoid circular references
          if (
            currentFilePath &&
            path.resolve(fullPath) === path.resolve(currentFilePath)
          ) {
            continue;
          }

          completions.push({
            label: entry.name,
            kind: CompletionItemKind.File,
            detail: "RWX run definition file",
            insertText: entry.name,
            data: `file-${entry.name}`,
          });
        }
      }
    }

    return completions.sort((a, b) => {
      // Sort directories first, then files
      if (
        a.kind === CompletionItemKind.Folder &&
        b.kind === CompletionItemKind.File
      ) {
        return -1;
      }
      if (
        a.kind === CompletionItemKind.File &&
        b.kind === CompletionItemKind.Folder
      ) {
        return 1;
      }
      // Within same type, sort alphabetically
      return a.label.localeCompare(b.label);
    });
  } catch (error) {
    connection.console.error(
      `Error getting file completions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return [];
  }
}

// Helper function to extract package name and version from a call line
function extractPackageAndVersionFromCallLine(
  line: string
): { packageName: string; version: string } | null {
  // Skip embedded run calls
  if (line.includes("${{")) {
    return null;
  }

  // Match pattern: "call: package-name version" or "  call: package-name version"
  const callPattern = /^\s*call:\s*([^\s]+)\s+([^\s]+)/;
  const match = line.match(callPattern);
  return match && match[1] && match[2]
    ? { packageName: match[1], version: match[2] }
    : null;
}

// Helper function to check if position is in a 'call' context
function isInPackageCallContext(
  document: TextDocument,
  position: { line: number; character: number }
): boolean {
  const lines = document.getText().split("\n");
  const currentLineIndex = position.line;
  const currentLine = lines[currentLineIndex] || "";
  const beforeCursor = currentLine.substring(0, position.character);

  // First check if this is an embedded run call - if so, it's not a package call
  const embeddedRunPattern = /\s*call:\s*\$\{\{/;
  if (embeddedRunPattern.test(beforeCursor)) {
    return false;
  }

  // Check if we're in a call declaration: "call: value"
  const callPattern = /\s*call:\s*/;
  if (callPattern.test(beforeCursor)) {
    return true;
  }

  return false;
}

// Helper function to check if position is in an embedded run call context
function isInEmbeddedRunCallContext(
  document: TextDocument,
  position: { line: number; character: number }
): { isInContext: boolean; relativePath: string } {
  const lines = document.getText().split("\n");
  const currentLineIndex = position.line;
  const currentLine = lines[currentLineIndex] || "";
  const beforeCursor = currentLine.substring(0, position.character);

  // Check if we're in a call context that contains ${{ run.mint-dir }}
  const embeddedRunSlashPattern =
    /\s*call:\s*\$\{\{\s*run\.mint-dir\s*\}\}\/(.*)$/;
  const embeddedRunBasePattern = /\s*call:\s*\$\{\{\s*run\.mint-dir\s*\}\}$/;

  const slashMatch = beforeCursor.match(embeddedRunSlashPattern);
  const baseMatch = beforeCursor.match(embeddedRunBasePattern);

  if (slashMatch) {
    // Extract the path after ${{ run.mint-dir }}/
    const afterMintDir = slashMatch[1] || "";
    return { isInContext: true, relativePath: afterMintDir };
  } else if (baseMatch) {
    // Just typed ${{ run.mint-dir }}, ready for slash and file completion
    return { isInContext: true, relativePath: "" };
  }

  return { isInContext: false, relativePath: "" };
}

// Helper function to extract file path from embedded run call line
function extractEmbeddedRunFilePath(line: string): string | null {
  // Match pattern: "call: ${{ run.mint-dir }}/path/to/file.yml"
  const embeddedRunPattern = /\s*call:\s*\$\{\{\s*run\.mint-dir\s*\}\}\/(.+)/;
  const match = line.match(embeddedRunPattern);

  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

// Helper function to check if position is within an embedded run file path for go-to-definition
function getEmbeddedRunFilePathAtPosition(
  document: TextDocument,
  position: Position
): { filePath: string; range: Range } | null {
  const lines = document.getText().split("\n");
  const currentLine = lines[position.line];

  if (!currentLine) {
    return null;
  }

  // Check if this line contains an embedded run call
  const filePath = extractEmbeddedRunFilePath(currentLine);
  if (!filePath) {
    return null;
  }

  // Find the start and end positions of the file path in the line
  const embeddedRunPattern = /(\s*call:\s*\$\{\{\s*run\.mint-dir\s*\}\}\/)(.+)/;
  const match = currentLine.match(embeddedRunPattern);

  if (!match) {
    return null;
  }

  const prefixLength = match[1]?.length || 0;
  const filePathStart = prefixLength;
  const filePathEnd = prefixLength + (match[2]?.length || 0);

  // Check if the cursor position is within the file path
  if (
    position.character >= filePathStart &&
    position.character <= filePathEnd
  ) {
    const range = Range.create(
      Position.create(position.line, filePathStart),
      Position.create(position.line, filePathEnd)
    );

    return { filePath, range };
  }

  return null;
}

// Helper function to check if position is in a 'with:' parameter context
function isInWithContext(
  document: TextDocument,
  position: { line: number; character: number }
): boolean {
  const lines = document.getText().split("\n");
  const currentLineIndex = position.line;
  const currentLine = lines[currentLineIndex] || "";
  const beforeCursor = currentLine.substring(0, position.character);

  // Check if we're directly on a 'with:' line after the colon (for empty with blocks)
  if (/^\s*with:\s*$/.test(beforeCursor)) {
    return true;
  }

  // Check if we're on an indented line under 'with:'
  // This handles empty lines, lines where we're typing parameter names, or right after 'with:'
  const currentIndent = currentLine.match(/^\s*/)?.[0].length || 0;

  // If we're on an indented line, look backwards to find the 'with:' declaration
  if (currentIndent > 0 || /^\s*$/.test(beforeCursor)) {
    for (let i = currentLineIndex - 1; i >= 0; i--) {
      const prevLine = lines[i];
      if (!prevLine || prevLine.trim() === "") continue;

      const prevIndent = prevLine.match(/^\s*/)?.[0].length || 0;

      // If we hit a line with equal or less indentation, check if it's 'with:'
      if (prevIndent <= currentIndent) {
        if (/^\s*with:\s*$/.test(prevLine)) {
          return true;
        }
        // If we hit another task-level key, we're no longer in the with block
        if (/^\s*-?\s*(key|call|use|run|with):\s/.test(prevLine)) {
          break;
        }
      }
    }
  }

  return false;
}

// Helper function to find the call package for a with block
function findCallPackageForWithBlock(
  document: TextDocument,
  withLineIndex: number
): { packageName: string; version: string } | null {
  const lines = document.getText().split("\n");

  // Look backwards from the with: line to find the call: line in the same task
  for (let i = withLineIndex - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || line.trim() === "") continue;

    // Check if this is a call: line
    const packageInfo = extractPackageAndVersionFromCallLine(line);
    if (packageInfo) {
      return packageInfo;
    }

    // If we hit a line that starts a new task (- key:), stop looking
    if (/^\s*-\s+key:/.test(line)) {
      break;
    }
  }

  return null;
}

// Helper function to extract all call lines from a document
function extractAllCallLines(document: TextDocument): Array<{
  packageName: string;
  version: string;
  line: number;
  versionStart: number;
  versionEnd: number;
}> {
  const lines = document.getText().split("\n");
  const callLines: Array<{
    packageName: string;
    version: string;
    line: number;
    versionStart: number;
    versionEnd: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const packageInfo = extractPackageAndVersionFromCallLine(line);
    if (packageInfo) {
      // Find the position of the version string in the line
      const versionIndex = line.lastIndexOf(packageInfo.version);
      if (versionIndex !== -1) {
        callLines.push({
          packageName: packageInfo.packageName,
          version: packageInfo.version,
          line: i,
          versionStart: versionIndex,
          versionEnd: versionIndex + packageInfo.version.length,
        });
      }
    }
  }

  return callLines;
}

// Helper function to check if a package version is outdated
async function checkPackageVersions(
  document: TextDocument
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  try {
    // Get latest package versions from the API
    const latestPackages = await fetchRWXPackages();
    if (!latestPackages) {
      return diagnostics;
    }

    // Extract all call lines from the document
    const callLines = extractAllCallLines(document);

    for (const callLine of callLines) {
      const latestPackage = latestPackages[callLine.packageName];
      if (latestPackage && latestPackage.version !== callLine.version) {
        // Create a diagnostic for the outdated version
        const diagnostic: Diagnostic = {
          severity: DiagnosticSeverity.Warning,
          range: {
            start: Position.create(callLine.line, callLine.versionStart),
            end: Position.create(callLine.line, callLine.versionEnd),
          },
          message: `Package version ${callLine.version} is outdated. The newest version is ${latestPackage.version}.`,
          source: "rwx",
          code: "outdated-version",
          data: {
            packageName: callLine.packageName,
            currentVersion: callLine.version,
            latestVersion: latestPackage.version,
            line: callLine.line,
            versionStart: callLine.versionStart,
            versionEnd: callLine.versionEnd,
          },
        };
        diagnostics.push(diagnostic);
      }
    }
  } catch (error) {
    connection.console.error(
      `Error checking package versions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return diagnostics;
}

// Helper function to check if position is in a 'use' context
function isInUseContext(
  document: TextDocument,
  position: { line: number; character: number }
): boolean {
  const lines = document.getText().split("\n");
  const currentLineIndex = position.line;
  const currentLine = lines[currentLineIndex] || "";
  const beforeCursor = currentLine.substring(0, position.character);

  // Check if we're in a simple use declaration: "use: value"
  const simpleUsePattern = /\s*use:\s*/;
  if (simpleUsePattern.test(beforeCursor)) {
    // Make sure we're not in an array context
    if (!beforeCursor.includes("[")) {
      return true;
    }
  }

  // Check if we're in a use array context anywhere on the line
  // Look for "use:" followed by "[" somewhere before cursor, but no closing "]"
  if (
    beforeCursor.includes("use:") &&
    beforeCursor.includes("[") &&
    !beforeCursor.includes("]")
  ) {
    return true;
  }

  // Define pattern for use: [ detection
  const useArrayPattern = /use:\s*\[/;

  // Additional check: if the line contains "use: [" but cursor is after comma or space
  if (
    currentLine.includes("use:") &&
    currentLine.includes("[")
  ) {
    // Check if we're positioned after the opening bracket
    const useArrayMatch = currentLine.match(useArrayPattern);
    if (useArrayMatch) {
      const arrayStartPos = useArrayMatch.index! + useArrayMatch[0].length;
      if (position.character >= arrayStartPos) {
        // We're positioned after the opening bracket
        return true;
      }
    }
  }

  // Check for multi-line array context
  // Look backward from current line to find "use: [" without a closing "]"
  let arrayStartLine = -1;
  let arrayDepth = 0;
  
  for (let i = currentLineIndex; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    
    // Count brackets on this line
    const openBrackets = (line.match(/\[/g) || []).length;
    const closeBrackets = (line.match(/\]/g) || []).length;
    
    if (i === currentLineIndex) {
      // For current line, only count brackets before cursor
      const beforeCursorLine = line.substring(0, position.character);
      const openBracketsBefore = (beforeCursorLine.match(/\[/g) || []).length;
      const closeBracketsBefore = (beforeCursorLine.match(/\]/g) || []).length;
      arrayDepth = openBracketsBefore - closeBracketsBefore;
    } else {
      arrayDepth += openBrackets - closeBrackets;
    }
    
    // If we found "use: [" pattern and we're in positive array depth
    if (useArrayPattern.test(line) && arrayDepth > 0) {
      arrayStartLine = i;
      break;
    }
    
    // If we hit a line that starts a new task or other structure, stop looking
    if (/^\s*-\s+(key|call|use|run|with):\s/.test(line) && i < currentLineIndex) {
      break;
    }
  }
  
  // Only return true for multi-line arrays (not single-line arrays like "use: []")
  return arrayStartLine !== -1 && arrayStartLine < currentLineIndex;
}

// This handler provides the initial list of the completion items.
connection.onCompletion(
  async (
    textDocumentPosition: TextDocumentPositionParams
  ): Promise<CompletionItem[]> => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      return [];
    }

    // Only provide completions for Mint workflow files
    if (!isRwxRunFile(document)) {
      return [];
    }

    // Check if we're in a 'use' context for task completions
    if (isInUseContext(document, textDocumentPosition.position)) {
      try {
        // Parse the document to get available task keys
        let text = document.getText();
        const snippets = new Map();
        const fileName = document.uri.replace("file://", "");
        
        // If we have incomplete array syntax, try to complete it temporarily for parsing
        const lines = text.split('\n');
        const currentLineIndex = textDocumentPosition.position.line;
        const currentLine = lines[currentLineIndex] || "";
        
        // Check if current line ends with "use: [" and complete it temporarily
        if (currentLine.trim().endsWith('use: [')) {
          lines[currentLineIndex] = currentLine + ']';
          text = lines.join('\n');
        } else if (currentLine.includes('use: [') && currentLine.includes(']')) {
          // Single-line array with closing bracket - no modification needed
          // The YAML is already complete
        } else {
          // Check for multi-line array completion
          // Look backward to find "use: [" without closing "]"
          let needsClosing = false;
          let arrayDepth = 0;
          
          for (let i = currentLineIndex; i >= 0; i--) {
            const line = lines[i];
            if (!line) continue;
            
            // Count brackets on this line
            const openBrackets = (line.match(/\[/g) || []).length;
            const closeBrackets = (line.match(/\]/g) || []).length;
            
            if (i === currentLineIndex) {
              // For current line, only count brackets before cursor
              const beforeCursorLine = line.substring(0, textDocumentPosition.position.character);
              const openBracketsBefore = (beforeCursorLine.match(/\[/g) || []).length;
              const closeBracketsBefore = (beforeCursorLine.match(/\]/g) || []).length;
              arrayDepth = openBracketsBefore - closeBracketsBefore;
            } else {
              arrayDepth += openBrackets - closeBrackets;
            }
            
            // If we found "use: [" pattern and we're in positive array depth
            if (/use:\s*\[/.test(line) && arrayDepth > 0) {
              needsClosing = true;
              break;
            }
            
            // If we hit a line that starts a new task, stop looking
            if (/^\s*-\s+(key|call|use|run|with):\s/.test(line) && i < currentLineIndex) {
              break;
            }
          }
          
          // If we need to close the array, add a closing bracket after the current line
          if (needsClosing) {
            // Check if a closing bracket already exists in the remaining lines
            let hasClosingBracket = false;
            for (let i = currentLineIndex + 1; i < lines.length; i++) {
              const line = lines[i];
              if (line && line.includes(']')) {
                hasClosingBracket = true;
                break;
              }
              // Stop if we hit a new task definition
              if (line && /^\s*-\s+(key|call|use|run|with):\s/.test(line)) {
                break;
              }
            }
            
            // Only add closing bracket if one doesn't already exist
            if (!hasClosingBracket) {
              // Find the appropriate indentation for the closing bracket
              const useLineIndex = lines.findIndex((line, idx) => 
                idx <= currentLineIndex && /use:\s*\[/.test(line)
              );
              if (useLineIndex !== -1) {
                const useLine = lines[useLineIndex];
                if (useLine) {
                  const useIndent = useLine.match(/^\s*/)?.[0] || "";
                  lines.splice(currentLineIndex + 1, 0, `${useIndent}]`);
                  text = lines.join('\n');
                }
              }
            }
          }
        }
        
        const result = await YamlParser.safelyParseRun(
          fileName,
          text,
          snippets
        );

        const taskKeys = extractTaskKeys(result);

        // Return completion items for task keys
        return taskKeys.map((key, index) => ({
          label: key,
          kind: CompletionItemKind.Reference,
          detail: "Task dependency",
          documentation: `Reference to task "${key}"`,
          data: `task-${index}`,
          insertText: key,
        }));
      } catch (error) {
        connection.console.error(
          `Error getting task completions: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return [];
      }
    }

    // Check if we're in an embedded run call context for file path completions
    const embeddedRunContext = isInEmbeddedRunCallContext(
      document,
      textDocumentPosition.position
    );
    if (embeddedRunContext.isInContext) {
      try {
        // Find the .mint or .rwx directory
        const filePath = document.uri.replace("file://", "");
        const mintDir = findMintDirectory(filePath);

        if (!mintDir) {
          return [];
        }

        // Get file completions from the mint directory
        return await getFileCompletions(
          mintDir,
          embeddedRunContext.relativePath,
          filePath
        );
      } catch (error) {
        connection.console.error(
          `Error getting file path completions: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return [];
      }
    }

    // Check if we're in a 'call' context for RWX package completions
    if (isInPackageCallContext(document, textDocumentPosition.position)) {
      try {
        const packages = await fetchRWXPackages();
        if (!packages) {
          return [];
        }

        // Convert packages to completion items
        return Object.entries(packages).map(
          ([packageName, packageInfo], index) => ({
            label: packageName,
            kind: CompletionItemKind.Module,
            detail: `v${packageInfo.version}`,
            data: `package-${index}`,
            insertText: `${packageName} ${packageInfo.version}`,
          })
        );
      } catch (error) {
        connection.console.error(
          `Error getting package completions: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return [];
      }
    }

    // Check if we're in a 'with' context for parameter completions
    if (isInWithContext(document, textDocumentPosition.position)) {
      try {
        // Find the associated call package
        const packageInfo = findCallPackageForWithBlock(
          document,
          textDocumentPosition.position.line
        );
        if (!packageInfo) {
          return [];
        }

        // Fetch detailed package information to get parameters
        const packageDetails = await fetchPackageDetails(
          packageInfo.packageName,
          packageInfo.version
        );
        if (!packageDetails || !packageDetails.parameters) {
          return [];
        }

        // Convert parameters to completion items
        return packageDetails.parameters.map((param, index) => {
          let detail = "";
          if (param.required) {
            detail = "required";
          } else if (param.default) {
            detail = `default: "${param.default}"`;
          }

          return {
            label: param.name,
            kind: CompletionItemKind.Property,
            detail: detail,
            documentation: param.description,
            data: `param-${index}`,
            insertText: `${param.name}: `,
          };
        });
      } catch (error) {
        connection.console.error(
          `Error getting parameter completions: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return [];
      }
    }

    // Don't provide any completions if we're not in use context - let other extensions handle it
    return [];
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.data === 1) {
    item.detail = "Task definition";
    item.documentation = "Define tasks for your RWX workflow";
  } else if (item.data === 2) {
    item.detail = "Trigger definition";
    item.documentation = "Define triggers for your RWX workflow";
  }
  return item;
});

// Helper function to get the word and its range at a position
function getWordRangeAtPosition(
  document: TextDocument,
  position: Position
): { word: string; range: Range } | null {
  const line = document.getText().split("\n")[position.line];
  if (!line) return null;

  const beforeCursor = line.substring(0, position.character);
  const afterCursor = line.substring(position.character);

  // Find task name boundaries - valid task names can contain letters, digits, hyphens, underscores
  // Pattern matches: word-word, word--word, word_word, etc.
  const wordStart = beforeCursor.search(/[a-zA-Z0-9_-]+$/);
  const wordEndMatch = afterCursor.match(/^[a-zA-Z0-9_-]*/);

  if (wordStart === -1 || !wordEndMatch) return null;

  const wordEnd = wordEndMatch[0].length;
  const fullWord = line.substring(wordStart, position.character + wordEnd);

  // Ensure we have a valid task name (not just hyphens or underscores)
  if (!/[a-zA-Z0-9]/.test(fullWord)) return null;

  const startPos = Position.create(position.line, wordStart);
  const endPos = Position.create(position.line, position.character + wordEnd);

  return {
    word: fullWord,
    range: Range.create(startPos, endPos),
  };
}

// Helper function to detect YAML alias at position and extract alias name
function getYamlAliasAtPosition(
  document: TextDocument,
  position: Position
): { aliasName: string; range: Range } | null {
  const line = document.getText().split("\n")[position.line];
  if (!line) return null;

  // Find all alias occurrences in the line
  const aliasRegex = /\*([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = aliasRegex.exec(line)) !== null) {
    const aliasStart = match.index;
    const aliasEnd = match.index + match[0].length;

    // Check if the cursor position is within this alias
    if (position.character >= aliasStart && position.character <= aliasEnd) {
      if (match[1]) {
        return {
          aliasName: match[1],
          range: Range.create(
            Position.create(position.line, aliasStart),
            Position.create(position.line, aliasEnd)
          ),
        };
      }
    }
  }

  return null;
}

// Helper function to find YAML anchor definition in document
function findYamlAnchor(
  document: TextDocument,
  anchorName: string
): Position | null {
  const lines = document.getText().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Look for anchor pattern: &anchorName
    const anchorPattern = new RegExp(
      `&${escapeRegExp(anchorName)}(?![a-zA-Z0-9_-])`
    );
    const match = line.match(anchorPattern);
    if (match && match.index !== undefined) {
      return Position.create(i, match.index);
    }
  }

  return null;
}

// Helper function to extract YAML anchor content for display
function getYamlAnchorContent(
  document: TextDocument,
  anchorName: string
): string | null {
  const lines = document.getText().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Look for anchor pattern: &anchorName
    const anchorPattern = new RegExp(
      `&${escapeRegExp(anchorName)}(?![a-zA-Z0-9_-])`
    );
    const match = line.match(anchorPattern);
    if (match && match.index !== undefined) {
      // Found the anchor, now extract its content
      const anchorLine = line;
      const afterAnchor = anchorLine.substring(match.index + match[0].length);

      // If there's content on the same line after the anchor (inline anchor)
      if (afterAnchor.trim()) {
        return afterAnchor.trim();
      }

      // Look for content on subsequent lines with proper indentation (block anchor)
      const lineIndent = line.match(/^\s*/)?.[0].length || 0;
      const contentLines: string[] = [];

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (!nextLine || !nextLine.trim()) {
          // Empty line, continue but don't break (might be whitespace in YAML block)
          continue;
        }

        const nextIndent = nextLine.match(/^\s*/)?.[0].length || 0;

        // If we hit a line with same or less indentation than the anchor line, we've reached the end
        if (nextIndent <= lineIndent) {
          break;
        }

        // Add this line to the content (preserve relative indentation)
        const relativeIndent = nextIndent - lineIndent - 2; // Subtract anchor's indent + typical 2 spaces
        const indentStr = relativeIndent > 0 ? " ".repeat(relativeIndent) : "";
        contentLines.push(indentStr + nextLine.trim());
      }

      if (contentLines.length > 0) {
        return contentLines.join("\n");
      }

      // If no content found, return placeholder
      return `(anchor: ${anchorName})`;
    }
  }

  return null;
}

// Helper function to detect YAML anchor at position and extract anchor name
function getYamlAnchorAtPosition(
  document: TextDocument,
  position: Position
): { anchorName: string; range: Range } | null {
  const line = document.getText().split("\n")[position.line];
  if (!line) return null;

  // Find all anchor occurrences in the line
  const anchorRegex = /&([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = anchorRegex.exec(line)) !== null) {
    const anchorStart = match.index;
    const anchorEnd = match.index + match[0].length;

    // Check if the cursor position is within this anchor
    if (position.character >= anchorStart && position.character <= anchorEnd) {
      if (match[1]) {
        return {
          anchorName: match[1],
          range: Range.create(
            Position.create(position.line, anchorStart),
            Position.create(position.line, anchorEnd)
          ),
        };
      }
    }
  }

  return null;
}

// Helper function to find all aliases that reference a given anchor
function findYamlAliasReferences(
  document: TextDocument,
  anchorName: string
): Location[] {
  const lines = document.getText().split("\n");
  const locations: Location[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Find all alias occurrences in this line
    const aliasRegex = new RegExp(
      `\\*${escapeRegExp(anchorName)}(?![a-zA-Z0-9_-])`,
      "g"
    );
    let match;

    while ((match = aliasRegex.exec(line)) !== null) {
      const aliasStart = match.index;
      const aliasEnd = match.index + match[0].length;

      const location: Location = {
        uri: document.uri,
        range: Range.create(
          Position.create(i, aliasStart),
          Position.create(i, aliasEnd)
        ),
      };

      locations.push(location);
    }
  }

  return locations;
}

// Helper function to detect if cursor is on a task key definition
function getTaskKeyAtPosition(
  document: TextDocument,
  position: Position
): { taskKey: string; range: Range } | null {
  const line = document.getText().split("\n")[position.line];
  if (!line) return null;

  // Look for "key: taskname" pattern
  const keyPattern = /^\s*(?:-\s+)?key:\s*['"]?([a-zA-Z0-9_-]+)['"]?\s*$/;
  const match = line.match(keyPattern);

  if (match && match[1]) {
    const taskKey = match[1];
    const keyIndex = line.indexOf(taskKey);

    // Check if cursor is on the task key value
    if (
      position.character >= keyIndex &&
      position.character <= keyIndex + taskKey.length
    ) {
      return {
        taskKey,
        range: Range.create(
          Position.create(position.line, keyIndex),
          Position.create(position.line, keyIndex + taskKey.length)
        ),
      };
    }
  }

  return null;
}

// Helper function to find all use references to a task key
function findTaskUseReferences(
  document: TextDocument,
  taskKey: string
): Location[] {
  const lines = document.getText().split("\n");
  const locations: Location[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.includes("use:")) continue;

    // Find task key in simple use context: "use: taskKey"
    const simpleUsePattern = new RegExp(
      `use:\\s*['"]?${escapeRegExp(taskKey)}['"]?\\s*$`
    );
    if (simpleUsePattern.test(line)) {
      const keyIndex = line.lastIndexOf(taskKey);
      if (keyIndex !== -1) {
        locations.push({
          uri: document.uri,
          range: Range.create(
            Position.create(i, keyIndex),
            Position.create(i, keyIndex + taskKey.length)
          ),
        });
      }
    }

    // Find task key in array use context: "use: [taskKey, other]" or "use: [other, taskKey]"
    const arrayUsePattern = new RegExp(`use:\\s*\\[([^\\]]+)\\]`);
    const arrayMatch = line.match(arrayUsePattern);
    if (arrayMatch && arrayMatch[1]) {
      const arrayContent = arrayMatch[1];
      const arrayStart = arrayMatch.index! + arrayMatch[0].indexOf("[") + 1;

      // Split by commas and find our task key
      const items = arrayContent.split(",");
      let currentPos = 0;

      for (const item of items) {
        const trimmedItem = item.trim().replace(/['"`]/g, ""); // Remove quotes
        if (trimmedItem === taskKey) {
          const itemStart = arrayContent.indexOf(item, currentPos);
          const keyStart = arrayStart + itemStart + item.indexOf(taskKey);

          locations.push({
            uri: document.uri,
            range: Range.create(
              Position.create(i, keyStart),
              Position.create(i, keyStart + taskKey.length)
            ),
          });
        }
        currentPos += item.length + 1; // +1 for comma
      }
    }
  }

  return locations;
}

// Definition provider
connection.onDefinition(
  async (
    params: TextDocumentPositionParams
  ): Promise<LocationLink[] | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document || !isRwxRunFile(document)) {
      return null;
    }

    // Check if we're clicking on a YAML alias for go-to-anchor functionality
    const aliasInfo = getYamlAliasAtPosition(document, params.position);
    if (aliasInfo) {
      try {
        // Find the corresponding anchor
        const anchorPosition = findYamlAnchor(document, aliasInfo.aliasName);
        if (!anchorPosition) {
          return null;
        }

        // Create a range that covers the entire anchor at the definition
        const anchorEnd = Position.create(
          anchorPosition.line,
          anchorPosition.character + aliasInfo.aliasName.length + 1
        ); // +1 for the &
        const anchorRange = Range.create(anchorPosition, anchorEnd);

        // Return a LocationLink from alias to anchor
        const locationLink: LocationLink = {
          originSelectionRange: aliasInfo.range, // Highlights the source alias
          targetUri: document.uri,
          targetRange: anchorRange,
          targetSelectionRange: anchorRange,
        };

        return [locationLink];
      } catch (error) {
        connection.console.error(
          `Error in YAML alias go-to-definition: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return null;
      }
    }

    // Check if we're clicking on an embedded run file path
    const embeddedRunInfo = getEmbeddedRunFilePathAtPosition(
      document,
      params.position
    );
    if (embeddedRunInfo) {
      try {
        // Find the .mint or .rwx directory
        const currentFilePath = document.uri.replace("file://", "");
        const mintDir = findMintDirectory(currentFilePath);

        if (!mintDir) {
          return null;
        }

        // Construct the target file path
        const targetFilePath = path.join(mintDir, embeddedRunInfo.filePath);

        // Check if the file exists
        if (!fs.existsSync(targetFilePath)) {
          return null;
        }

        // Create the target URI
        const targetUri = `file://${targetFilePath}`;

        // Return a LocationLink to the target file
        const locationLink: LocationLink = {
          originSelectionRange: embeddedRunInfo.range,
          targetUri: targetUri,
          targetRange: Range.create(
            Position.create(0, 0),
            Position.create(0, 0)
          ),
          targetSelectionRange: Range.create(
            Position.create(0, 0),
            Position.create(0, 0)
          ),
        };

        return [locationLink];
      } catch (error) {
        connection.console.error(
          `Error in embedded run go-to-definition: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return null;
      }
    }

    // Check if we're in a use context for task definitions
    if (!isInUseContext(document, params.position)) {
      return null;
    }

    // Get the word and its range at the cursor position
    const wordInfo = getWordRangeAtPosition(document, params.position);
    if (!wordInfo) {
      return null;
    }

    // Find the task definition
    const definitionPosition = findTaskDefinition(document, wordInfo.word);
    if (!definitionPosition) {
      return null;
    }

    // Create a range that covers the entire task key at the definition
    const definitionEnd = Position.create(
      definitionPosition.line,
      definitionPosition.character + wordInfo.word.length
    );
    const definitionRange = Range.create(definitionPosition, definitionEnd);

    // Return a LocationLink with both source and target ranges
    const locationLink: LocationLink = {
      originSelectionRange: wordInfo.range, // Highlights the source word
      targetUri: document.uri,
      targetRange: definitionRange,
      targetSelectionRange: definitionRange,
    };

    return [locationLink];
  }
);

// Hover provider - only handle specific RWX features, let YAML extension handle schema
connection.onHover(
  async (params: TextDocumentPositionParams): Promise<Hover | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document || !isRwxRunFile(document)) {
      return null;
    }

    // ONLY handle our specific hover cases:
    // 1. YAML aliases (*alias-name)
    // 2. Package hovers (call: package version)
    // 3. Parameter hovers in 'with' blocks
    // Let the YAML extension handle all other field hovers

    // Check if we're hovering over a YAML alias
    const aliasInfo = getYamlAliasAtPosition(document, params.position);
    if (aliasInfo) {
      try {
        // Get the anchor content
        const anchorContent = getYamlAnchorContent(
          document,
          aliasInfo.aliasName
        );

        if (anchorContent) {
          const hoverContent = {
            kind: MarkupKind.Markdown,
            value: `**YAML Alias: \`*${aliasInfo.aliasName}\`**\n\n\`\`\`yaml\n${anchorContent}\n\`\`\``,
          };

          return {
            contents: hoverContent,
            range: aliasInfo.range,
          };
        }
      } catch (error) {
        connection.console.error(
          `Error getting YAML alias hover info: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const lines = document.getText().split("\n");
    const currentLine = lines[params.position.line];

    if (!currentLine) {
      return null;
    }

    // Check if this line contains a call declaration with package and version
    const packageInfo = extractPackageAndVersionFromCallLine(currentLine);
    if (packageInfo) {
      try {
        // Fetch detailed package information for the specific version
        const packageDetails = await fetchPackageDetails(
          packageInfo.packageName,
          packageInfo.version
        );
        if (!packageDetails) {
          return null;
        }

        // Build hover content with detailed information
        const hoverParts = [
          `**${packageDetails.name}** v${packageDetails.version}`,
          "",
          packageDetails.description,
          "",
        ];

        // Add source code URL if available
        if (packageDetails.source_code_url) {
          hoverParts.push(`**Source Code:** ${packageDetails.source_code_url}`);
        }

        // Add issue tracker URL if available
        if (packageDetails.issue_tracker_url) {
          hoverParts.push(
            "",
            `**Issues:** ${packageDetails.issue_tracker_url}`
          );
        }

        // Add parameters if available
        if (packageDetails.parameters && packageDetails.parameters.length > 0) {
          hoverParts.push("", "**Parameters:**");

          // Sort parameters: required first, then by name
          const sortedParams = [...packageDetails.parameters].sort((a, b) => {
            // Required parameters come first
            if (a.required && !b.required) return -1;
            if (!a.required && b.required) return 1;

            // Within same required status, sort alphabetically by name
            return a.name.localeCompare(b.name);
          });

          sortedParams.forEach((param) => {
            let paramInfo = `- \`${param.name}\``;

            if (param.required) {
              paramInfo += " **(required)**";
            } else if (param.default) {
              paramInfo += ` *(default: "${param.default}")*`;
            }

            paramInfo += `: ${param.description}`;
            hoverParts.push(paramInfo);
          });
        }

        const hoverContent = {
          kind: MarkupKind.Markdown,
          value: hoverParts.join("\n"),
        };

        return {
          contents: hoverContent,
        };
      } catch (error) {
        connection.console.error(
          `Error getting hover info: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return null;
      }
    }

    // Check if we're hovering over a parameter name in a with block
    // Only handle this if we're actually in a 'with' context
    if (isInWithContext(document, params.position)) {
      const paramMatch = currentLine.match(/^\s*([a-zA-Z0-9_-]+):/);
      if (paramMatch) {
        const paramName = paramMatch[1];

        try {
          // Find the associated call package
          const packageInfo = findCallPackageForWithBlock(
            document,
            params.position.line
          );
          if (!packageInfo) {
            return null;
          }

          // Fetch detailed package information to get parameter details
          const packageDetails = await fetchPackageDetails(
            packageInfo.packageName,
            packageInfo.version
          );
          if (!packageDetails || !packageDetails.parameters) {
            return null;
          }

          // Find the specific parameter
          const parameter = packageDetails.parameters.find(
            (p) => p.name === paramName
          );
          if (!parameter) {
            return null;
          }

          // Build hover content for the parameter
          const hoverParts = [`**${parameter.name}**`];

          if (parameter.required) {
            hoverParts.push("*Required parameter*");
          } else if (parameter.default) {
            hoverParts.push(`*Default: "${parameter.default}"*`);
          }

          hoverParts.push("", parameter.description);

          const hoverContent = {
            kind: MarkupKind.Markdown,
            value: hoverParts.join("\n"),
          };

          return {
            contents: hoverContent,
          };
        } catch (error) {
          connection.console.error(
            `Error getting parameter hover info: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return null;
        }
      }
    }

    // Return null for all other cases - let YAML extension handle schema-based hovers
    return null;
  }
);

// References provider
connection.onReferences((params: ReferenceParams): Location[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isRwxRunFile(document)) {
    return [];
  }

  try {
    // Check if we're on a YAML anchor
    const anchorInfo = getYamlAnchorAtPosition(document, params.position);
    if (anchorInfo) {
      // Find all aliases that reference this anchor
      const references = findYamlAliasReferences(
        document,
        anchorInfo.anchorName
      );

      // If includeDeclaration is true, also include the anchor itself
      if (params.context.includeDeclaration) {
        const anchorLocation: Location = {
          uri: document.uri,
          range: anchorInfo.range,
        };
        references.unshift(anchorLocation); // Add anchor at the beginning
      }

      return references;
    }

    // Optionally: Handle the reverse case - if on an alias, find other aliases and the anchor
    const aliasInfo = getYamlAliasAtPosition(document, params.position);
    if (aliasInfo) {
      const references: Location[] = [];

      // Find the anchor
      const anchorPosition = findYamlAnchor(document, aliasInfo.aliasName);
      if (anchorPosition && params.context.includeDeclaration) {
        const anchorEnd = Position.create(
          anchorPosition.line,
          anchorPosition.character + aliasInfo.aliasName.length + 1
        );
        const anchorRange = Range.create(anchorPosition, anchorEnd);
        references.push({
          uri: document.uri,
          range: anchorRange,
        });
      }

      // Find all other aliases
      const allAliases = findYamlAliasReferences(document, aliasInfo.aliasName);
      references.push(...allAliases);

      return references;
    }

    // Check if we're on a task key definition
    const taskKeyInfo = getTaskKeyAtPosition(document, params.position);
    if (taskKeyInfo) {
      const references: Location[] = [];

      // If includeDeclaration is true, include the task definition itself
      if (params.context.includeDeclaration) {
        references.push({
          uri: document.uri,
          range: taskKeyInfo.range,
        });
      }

      // Find all use references to this task key
      const useReferences = findTaskUseReferences(
        document,
        taskKeyInfo.taskKey
      );
      references.push(...useReferences);

      return references;
    }
  } catch (error) {
    connection.console.error(
      `Error in references provider: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return [];
});

// Code action provider
connection.onCodeAction(
  async (params: CodeActionParams): Promise<CodeAction[]> => {
    const codeActions: CodeAction[] = [];
    const document = documents.get(params.textDocument.uri);

    if (!document || !isRwxRunFile(document)) {
      return codeActions;
    }

    // Check for outdated version diagnostics
    const outdatedDiagnostics = params.context.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === "outdated-version" && diagnostic.source === "rwx"
    );

    for (const diagnostic of outdatedDiagnostics) {
      if (diagnostic.data) {
        const data = diagnostic.data as {
          packageName: string;
          currentVersion: string;
          latestVersion: string;
          line: number;
          versionStart: number;
          versionEnd: number;
        };

        // Create a code action to update to the latest version
        const codeAction: CodeAction = {
          title: `Update to latest version (${data.latestVersion})`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [params.textDocument.uri]: [
                TextEdit.replace(
                  Range.create(
                    Position.create(data.line, data.versionStart),
                    Position.create(data.line, data.versionEnd)
                  ),
                  data.latestVersion
                ),
              ],
            },
          },
        };

        codeActions.push(codeAction);
      }
    }

    // If no diagnostics, check if cursor is on a package call line
    if (outdatedDiagnostics.length === 0) {
      const latestPackages = await fetchRWXPackages();
      if (latestPackages) {
        const lines = document.getText().split("\n");
        const startLine = params.range.start.line;
        const endLine = params.range.end.line;

        for (
          let lineNum = startLine;
          lineNum <= endLine && lineNum < lines.length;
          lineNum++
        ) {
          const line = lines[lineNum];
          if (!line) continue;

          const packageInfo = extractPackageAndVersionFromCallLine(line);

          if (packageInfo) {
            const latestPackage = latestPackages[packageInfo.packageName];
            if (
              latestPackage &&
              latestPackage.version !== packageInfo.version
            ) {
              // Check if the range overlaps with the package call
              const versionIndex = line.lastIndexOf(packageInfo.version);
              if (versionIndex !== -1) {
                const versionStart = versionIndex;
                const versionEnd = versionIndex + packageInfo.version.length;

                // Check if the selection range includes this package
                if (
                  (lineNum > startLine ||
                    params.range.start.character <= versionEnd) &&
                  (lineNum < endLine ||
                    params.range.end.character >= versionStart)
                ) {
                  const codeAction: CodeAction = {
                    title: `Update to latest version (${latestPackage.version})`,
                    kind: CodeActionKind.QuickFix,
                    edit: {
                      changes: {
                        [params.textDocument.uri]: [
                          TextEdit.replace(
                            Range.create(
                              Position.create(lineNum, versionStart),
                              Position.create(lineNum, versionEnd)
                            ),
                            latestPackage.version
                          ),
                        ],
                      },
                    },
                  };
                  codeActions.push(codeAction);
                }
              }
            }
          }
        }
      }
    }

    return codeActions;
  }
);

// Register debug command handler
connection.onRequest("rwx/dumpDebugData", async (params: { uri: string }) => {
  try {
    const document = documents.get(params.uri);
    if (!document) {
      return {
        error: "Document not found",
        requestedUri: params.uri,
        availableDocuments: Array.from(documents.keys()),
      };
    }

    if (!isRwxRunFile(document)) {
      return { error: "Not an RWX workflow file" };
    }

    const text = document.getText();
    const snippets = new Map();
    const fileName = document.uri.replace("file://", "");
    const result = await YamlParser.safelyParseRun(fileName, text, snippets);

    return {
      fileName,
      isMintFile: true,
      parseResult: {
        partialRunDefinition: result.partialRunDefinition,
        errors: result.errors,
      },
    };
  } catch (error) {
    return {
      error: `Failed to parse: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
