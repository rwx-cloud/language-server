import { readFileSync } from "fs";
import { join } from "path";

export function getAccessToken(options?: { accessToken?: unknown }): string {
  if (typeof options?.accessToken === "string") {
    return options.accessToken;
  }
  if (process.env.RWX_ACCESS_TOKEN) {
    return process.env.RWX_ACCESS_TOKEN;
  }

  const homeVariable = process.platform === "win32" ? "USERPROFILE" : "HOME";
  const home = process.env[homeVariable];
  if (!home) {
    throw new Error(`Unable to locate RWX access token: ${homeVariable} is not set`);
  }

  // Match the CLI's lookup order, but leave legacy token migration to the CLI.
  for (const directory of [join(home, ".config", "rwx"), join(home, ".mint")]) {
    try {
      return readFileSync(join(directory, "accesstoken"), "utf8").trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  return "";
}
