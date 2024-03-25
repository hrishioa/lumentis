import * as os from "node:os";
import * as path from "node:path";
import * as spawn from "cross-spawn";

export function parsePlatformIndependentPath(iPath: string): string {
  if (os.platform() === "win32") {
    return path.normalize(iPath.replace(/^["'](.*)["']$/, "$1").trim());
  } else {
    return path.normalize(
      iPath
        .replace(/^["'](.*)["']$/, "$1")
        .replace(/\\ /g, " ")
        .trim()
    );
  }
}

export function isCommandAvailable(command: string): boolean {
  try {
    const platform = os.platform();
    let result: ReturnType<typeof spawn.sync>;

    if (platform === "win32") {
      result = spawn.sync("where", [command], { stdio: "ignore" });
    } else {
      result = spawn.sync("which", [command], { stdio: "ignore" });
    }

    if (result.error) return false;
    return true;
  } catch (error) {
    return false;
  }
}
