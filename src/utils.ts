import * as os from "node:os";
import path from "node:path";
import * as spawn from "cross-spawn";

export async function runThunksInParallelQueue<T>(
  thunks: (() => Promise<T>)[],
  parallelJobs: number
) {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();

  async function runNext() {
    if (thunks.length === 0) return;

    const thunk = thunks.shift();
    if (!thunk) return;

    // console.log(`Job added, executing.size: ${executing.size + 1}`);
    const promise = thunk()
      .then((result) => {
        executing.delete(promise);
        results.push(result);
        // console.log(`Job completed, executing.size: ${executing.size + 1}`);
        return runNext();
      })
      .catch((err) => {
        executing.delete(promise);
        console.error(
          `Job failed in parallel execution, executing.size: ${
            executing.size + 1
          }`,
          err
        );
        return runNext();
      });

    executing.add(promise);

    if (executing.size >= parallelJobs) {
      await Promise.race(executing);
    }
  }

  const initialPromises = Array.from({ length: parallelJobs }, runNext);
  await Promise.all(initialPromises);

  // Wait for all remaining promises to resolve
  await Promise.all(executing);

  return results;
}

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

// Detect and parse partial JSONs, learned from thanks to https://github.com/indgov/partial-json-parser (indgov)

interface NonWhitespaceCharacter {
  character: string;
  index: number;
}

function getNonWhitespaceCharacterOfStringAt(
  s: string,
  index: number
): NonWhitespaceCharacter {
  let i = index;

  while (s[i].match(/\s/) !== null) {
    i--;
  }
  return {
    character: s[i],
    index: i
  };
}

export function partialParse(str: string): any {
  const tail: string[] = [];
  let i: number;

  let s = str.replace(/\r\n/g, "");

  for (i = 0; i < s.length; i++) {
    if (s[i] === "{") {
      tail.push("}");
    } else if (s[i] === "[") {
      tail.push("]");
    } else if (s[i] === "}") {
      tail.splice(tail.lastIndexOf("}"), 1);
    } else if (s[i] === "]") {
      tail.splice(tail.lastIndexOf("]"), 1);
    }
  }

  if (tail[tail.length - 1] === "}") {
    // Ignore checking if the last key is an array:
    if (s[s.length - 1] !== "]") {
      let insideLiteral = (s.split(/."/).length - 1) % 2 === 1; // If there are an odd number of double quotes, then we are in a string
      let lastKV = "";
      let metAColon = false;
      let j: number;

      for (j = s.length - 1; j > 0; j--) {
        if (s[j] === ":") {
          if (!insideLiteral) {
            metAColon = true;
            insideLiteral = false;
          }
        } else if (s[j] === "{") {
          if (!insideLiteral) {
            if (!metAColon) {
              lastKV = "";
            }
            j++;
            break;
          }
        } else if (s[j] === ",") {
          if (!insideLiteral) {
            if (!metAColon) {
              lastKV = "";
            }
            break;
          }
        } else {
          if (s[j] === '"') {
            insideLiteral = !insideLiteral;
          }
          if (!metAColon) {
            if (j !== s.length - 1 || s[j] !== "}") {
              lastKV = lastKV + s[j];
            }
          }
        }
      }

      lastKV = lastKV.split("").reverse().join("");

      if (
        lastKV !== "false" &&
        lastKV !== "true" &&
        lastKV !== "null" &&
        lastKV.match(/^\d+$/) === null &&
        !(
          lastKV.length !== 1 &&
          lastKV[0] === '"' &&
          lastKV[lastKV.length - 1] === '"'
        )
      ) {
        s = s.slice(0, j);
      }
    }
  } else if (tail[tail.length - 1] === "]") {
    if ((s.slice(s.lastIndexOf("[")).split('"').length - 1) % 2 === 1) {
      s = s.slice(0, s.lastIndexOf('"'));
    }
  }

  const lastCharacter = getNonWhitespaceCharacterOfStringAt(s, s.length - 1);
  if (lastCharacter.character === ",") {
    s = s.slice(0, lastCharacter.index);
  }

  tail.reverse();
  return JSON.parse(s + tail.join(""));
}
