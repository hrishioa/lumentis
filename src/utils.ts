import * as spawn from "cross-spawn";

export function isEditorInstalled(command: string): boolean {
  try {
    const result = spawn.sync("which", [command], { stdio: "ignore" });
    if (result.error) return false;
    return true;
  } catch (error) {
    return false;
  }
}
