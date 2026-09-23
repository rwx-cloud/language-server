import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { dir } from "tmp-promise";
import { TestLanguageServer } from "./test-helpers/test-server";

describe("Access token lookup", () => {
  let home: string;
  let primary: string;
  let legacy: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const temp = await dir({ unsafeCleanup: true });
    home = temp.path;
    cleanup = temp.cleanup;
    primary = join(home, ".config", "rwx", "accesstoken");
    legacy = join(home, ".mint", "accesstoken");
    mkdirSync(join(home, ".config", "rwx"), { recursive: true });
    mkdirSync(join(home, ".mint"));
  });

  afterEach(async () => {
    await cleanup();
  });

  function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      RWX_ACCESS_TOKEN: "",
      ...overrides,
    };
  }

  function lookup(options = {}, overrides: NodeJS.ProcessEnv = {}) {
    const modulePath = join(__dirname, "../out/access-token.js");
    return spawnSync(
      process.execPath,
      [
        "-e",
        `process.stdout.write(require(${JSON.stringify(modulePath)}).getAccessToken(JSON.parse(process.argv[1])))`,
        JSON.stringify(options),
      ],
      { env: environment(overrides), encoding: "utf8" },
    );
  }

  it("reads and trims the primary CLI token instead of the legacy token", () => {
    writeFileSync(primary, "\n  persisted-primary\t\r\n");
    writeFileSync(legacy, "legacy-token");
    const result = lookup();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("persisted-primary");
  });

  it("reads the legacy CLI token only when the primary is missing, without migrating it", () => {
    writeFileSync(legacy, "  legacy-token\n");
    const result = lookup();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("legacy-token");
    expect(existsSync(primary)).toBe(false);
  });

  it("does not fall back from an empty primary token", () => {
    writeFileSync(primary, " \n\t");
    writeFileSync(legacy, "legacy-token");
    const result = lookup();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it.each(["explicit-token", ""])(
    "honors explicit initialization token %j ahead of environment and file lookup",
    (accessToken) => {
      mkdirSync(primary);
      const result = lookup({ accessToken }, { RWX_ACCESS_TOKEN: "env-token" });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(accessToken);
    },
  );

  it("uses a nonempty environment token without trimming or reading files", () => {
    mkdirSync(primary);
    const result = lookup({}, { RWX_ACCESS_TOKEN: " env-token " });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(" env-token ");
  });

  it.each(["", undefined])("falls back to files for environment token %j", (token) => {
    writeFileSync(primary, "persisted-token");
    const result = lookup({}, { RWX_ACCESS_TOKEN: token });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("persisted-token");
  });

  it("ignores a non-string initialization token", () => {
    writeFileSync(primary, "persisted-token");
    const result = lookup({ accessToken: false });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("persisted-token");
  });

  it("uses anonymous access when neither token file exists", () => {
    const result = lookup();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("reports primary read errors instead of using a legacy token", () => {
    mkdirSync(primary);
    writeFileSync(legacy, "legacy-token");
    const result = lookup();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("EISDIR");
    expect(result.stderr).not.toContain("legacy-token");
  });

  it("reports legacy read errors instead of selecting anonymous access", () => {
    mkdirSync(legacy);
    const result = lookup();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("EISDIR");
  });

  it("reports a missing home directory", () => {
    const result = lookup({}, { HOME: "", USERPROFILE: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unable to locate RWX access token");
  });

  it("reports token read errors through LSP initialization", async () => {
    mkdirSync(primary);
    const server = new TestLanguageServer();
    await server.start(environment());
    try {
      await expect(server.initialize()).rejects.toThrow("EISDIR");
    } finally {
      await server.stop();
    }
  });

  it("allows explicit anonymous initialization even with unreadable defaults", async () => {
    mkdirSync(primary);
    const server = new TestLanguageServer();
    await server.start(environment());
    try {
      const result = await server.sendRequest("initialize", {
        processId: process.pid,
        capabilities: {},
        rootUri: null,
        initializationOptions: { accessToken: "" },
      });
      expect(result).toHaveProperty("capabilities.diagnosticProvider");
    } finally {
      await server.stop();
    }
  });
});
