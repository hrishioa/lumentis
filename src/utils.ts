import * as os from "node:os";
import * as spawn from "cross-spawn";

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
