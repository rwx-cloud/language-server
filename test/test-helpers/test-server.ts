import {
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver-protocol";

import { spawn, ChildProcess } from "child_process";
import * as path from "path";

interface LSPMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

/**
 * Manages a real language server process for testing
 */
export class TestLanguageServer {
  private serverProcess: ChildProcess | null = null;
  private messageId = 0;
  private responseHandlers = new Map<
    number,
    { resolve: Function; reject: Function }
  >();
  private notificationHandlers = new Map<string, Function>();
  private buffer = "";

  async start(): Promise<void> {
    const serverPath = path.join(__dirname, "../../out/server.js");

    this.serverProcess = spawn("node", [serverPath, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Pass through NODE_V8_COVERAGE for coverage collection
        NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE,
      },
    });

    this.serverProcess.stdout?.on("data", (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.serverProcess.stderr?.on("data", (data) => {
      console.error("Server error:", data.toString());
    });

    this.serverProcess.on("exit", (code) => {
      console.log("Server exited with code:", code);
    });

    // Wait a bit for server to start
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async stop(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  private processBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.buffer.substring(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length: (\d+)/);
      if (!contentLengthMatch) {
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1]!, 10);
      const messageStart = headerEnd + 4;

      if (this.buffer.length < messageStart + contentLength) break;

      const messageContent = this.buffer.substring(
        messageStart,
        messageStart + contentLength
      );
      this.buffer = this.buffer.substring(messageStart + contentLength);

      try {
        const message = JSON.parse(messageContent) as LSPMessage;
        this.handleMessage(message);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    }
  }

  private handleMessage(message: LSPMessage): void {
    if (
      message.id !== undefined &&
      (message.result !== undefined || message.error !== undefined)
    ) {
      // Response
      const handler = this.responseHandlers.get(message.id);
      if (handler) {
        if (message.error) {
          handler.reject(new Error(message.error.message));
        } else {
          handler.resolve(message.result);
        }
        this.responseHandlers.delete(message.id);
      }
    } else if (message.method && message.id !== undefined) {
      // Request from server
      const handler = this.notificationHandlers.get(message.method);
      if (handler) {
        const result = handler(message.params);
        // Send response
        this.sendMessage({
          jsonrpc: "2.0",
          id: message.id,
          result: result,
        });
      } else {
        // Send error response
        this.sendMessage({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: "Method not found",
          },
        });
      }
    } else if (message.method) {
      // Notification
      const handler = this.notificationHandlers.get(message.method);
      if (handler) {
        handler(message.params);
      }
    }
  }

  private sendMessage(message: LSPMessage): void {
    if (!this.serverProcess) throw new Error("Server not started");

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

    this.serverProcess.stdin?.write(header + content);
  }

  async sendRequest<T>(method: string, params?: any): Promise<T> {
    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.responseHandlers.set(id, { resolve, reject });

      this.sendMessage({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 5000);
    });
  }

  sendNotification(method: string, params?: any): void {
    this.sendMessage({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  onNotification(method: string, handler: Function): void {
    this.notificationHandlers.set(method, handler);
  }

  onRequest(method: string, handler: Function): void {
    this.notificationHandlers.set(method, handler);
  }

  async initialize(
    params?: Partial<InitializeParams>
  ): Promise<InitializeResult> {
    const defaultParams: InitializeParams = {
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

    const result = await this.sendRequest<InitializeResult>("initialize", {
      ...defaultParams,
      ...params,
    });

    // Send initialized notification
    this.sendNotification("initialized", {});

    return result;
  }
}
