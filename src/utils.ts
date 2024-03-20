import * as spawn from "cross-spawn";
import * as os from "os";

export function isCommandAvailable(command: string): boolean {
  try {
    const platform = os.platform();
    let result;

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
