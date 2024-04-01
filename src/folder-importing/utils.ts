#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { countTokens } from "@anthropic-ai/tokenizer";
import dirTree from "directory-tree";
import mime from "mime-types";
import type { CheckboxInput } from "src/types";
import { parsePlatformIndependentPath } from "../utils";

// ___________________________________FILE EXCLUSIONS AND INCLUSIONS SECTION___________________________________
// Edit this section to include/exclude file types and folders from the folder tree.

// I did a bunch of scrolling through mime types to come up with this list (https://www.iana.org/assignments/media-types/media-types.xhtml)
// However there's still possibly a bunch missing.
// Be aware that not all file types are reasable with the fs.readFileSync
// we're currently using (eg: microsoft docs and excel). To add the ability
// to read these, you'll also need to add a special file reader for that file
// type.
const readableMimeTypes = ["text", "message"];
const readableApplicationSubtypes = ["json", "xml", "yaml", "rtf", "rtx"];
// TODO: Does the below require `parsePlatformIndependentPath`?
const programming_extensions = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "..",
      "assets",
      "programming_language_extensions.json"
    ),
    "utf-8"
  )
);
const allowed_extensions = programming_extensions
  .filter((language) => language.type === "programming")
  .flatMap((language) => language.extensions);

// Extensions and paths to exclude from the folder tree.
// This is a list of extensions that are generally not readable by AI models.
// Please do add to it. We'll then do an additional file check on each file,
// but this should make those operations less heavy.
const excludeExtensions = [
  ".pdf",
  ".mp4",
  ".jpg",
  ".jpeg",
  ".png",
  ".o",
  ".mov",
  ".mp3",
  ".mpg",
  ".mpeg",
  ".avi",
  ".wmv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".a",
  ".lib",
  ".obj",
  ".pyc",
  ".class",
  ".jar",
  ".war",
  ".ear",
  ".zip",
  ".tar",
  ".class",
  ".jar",
  ".war",
  ".ear",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".tgz",
  ".tar.gz",
  ".tar.bz2",
  ".tar.xz",
  ".tar.7z",
  ".tar.Z",
  ".tar.lz",
  ".tar.lzma",
  ".tar.Z",
  ".tar.lz4",
  ".tar.lzop",
  ".tar.zst",
  ".tar.sz",
  ".tar.br",
  ".tar.bz",
  ".tar.lzo",
  ".gif",
  ".bmp",
  ".svg",
  ".webp",
  ".ico",
  ".tif",
  ".tiff",
  ".heif",
  ".heic",
  ".mkv",
  ".flv",
  ".webm",
  ".wav",
  ".aac",
  ".flac",
  ".ogg"
];
const folderTreeExclusions = [
  /^.*\/\.bin$/,
  /^.*\/node_modules$/,
  /^.*\/\.vscode$/,
  /^.*\/\.git/,
  /^.*\/test$/,
  /^.*\/dist$/,
  /^.*\/build$/,
  /^.*\/out$/,
  /^.*\/target$/,
  /^.*\/venv$/,
  /^.*\/__pycache__$/,
  /^.*\/\.idea$/,
  /^.*\/\.DS_Store$/
];
export const allExclusions = folderTreeExclusions.concat(
  excludeExtensions.map((ex) => new RegExp(`.*${ex}$`))
);

// ___________________________________CHECK FILE READABILITY___________________________________
// Recommend to the restrictions using the fields above

// This is using the Programming_Languages_Extensions.json from ppisarczyk: https://gist.github.com/ppisarczyk/43962d06686722d26d176fad46879d41
// I considered transforming it into just a list of programming extensions,
// but thought it might be more flexible fo use the whole thing in case we
// want to add data languages/specifically exclude certain languages.
// This helps us do so. I'm pretty sure it doesn't include compiled files.
function checkIfFileIsProgrammingLanguage(filename: string) {
  const extension = "." + filename.split(".").pop();
  return allowed_extensions.includes(extension);
}

export function checkFileIsReadable(filename: string) {
  // Allowable if it's a code file, since most LLMs are trained on large codebases.
  // Unfortunately the mime library doesn't infer most code extensions as text,
  // It just returns 'false'. So we have to check for programming languages separately.
  if (checkIfFileIsProgrammingLanguage(filename)) {
    return true;
  }
  const mimeType = mime.lookup(filename);
  if (!mimeType) {
    return false;
  }
  const [type, subtype] = mimeType.split("/");

  if (readableMimeTypes.includes(type)) {
    return true;
  } else if (
    type === "application" &&
    readableApplicationSubtypes.some((sub) => subtype.includes(sub))
  ) {
    return true;
  }
  return false;
}

// ___________________________________PROMPTING ADJUSTMENT__________________________________
// Adjust the AI prompt for folders here

const footerPromptString = "\n</NEW_FILE>\n";
const joinString = "\n\n____________________\n\n";

function getHeaderPromptString(filepath) {
  return `<NEW_FILE: ${filepath}>\n`;
}

export function getAdditionalPromptTokens(
  flat_selection: { name: string; value: string }[]
) {
  const promptString = flat_selection
    .filter((file) => !file.name.includes("📁"))
    .map((file) => {
      return getHeaderPromptString(file.value) + footerPromptString;
    })
    .join(joinString);
  return countTokens(promptString);
}

export function combineFilesToString(
  flat_selection: { name: string; value: string; checked: boolean }[]
) {
  return flat_selection
    .filter((file) => !file.name.includes("📁")) // Faster but more fragile than 'fs.lstatSync(file.value).isFile()'
    .map((file) => {
      const header = getHeaderPromptString(file.value);
      const content = fs.readFileSync(
        parsePlatformIndependentPath(file.value),
        "utf-8"
      );
      return `${header}${content}${footerPromptString}`;
    })
    .join(joinString);
}

// ___________________________________WORKER THREADS___________________________________
// Run the major work as worker threads to avoid blocking the main thread and allow timing out.
// See files starting with `worker-` for the worker scripts.

function createTimeoutPromise<T>(time = 5000, value = "timeoutFailed") {
  return new Promise<string>((resolve, reject) => {
    setTimeout(() => {
      return resolve(value);
    }, time);
  });
}

function runWorker(
  workerPath: string,
  data:
    | string
    | dirTree.DirectoryTree
    | { tree: dirTree.DirectoryTree; user_selection: string[] }
) {
  const worker = new Worker(workerPath);
  const promise = new Promise((resolve, reject) => {
    worker.postMessage(data);
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0 && code !== 1) {
        // Code 1 is used for manual termination
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
  return { worker, promise };
}

export async function getFileTree(
  filepath: string
): Promise<dirTree.DirectoryTree | "timeoutFailed"> {
  const { worker, promise } = runWorker(
    path.join(__dirname, "worker-dirtree.js"),
    filepath
  );
  const timeout = createTimeoutPromise(5000);
  const result = await Promise.race([promise, timeout]);
  worker.terminate();
  if (result === "timeoutFailed") {
    return "timeoutFailed";
  } else {
    return result as dirTree.DirectoryTree;
  }
}

export async function removeExcludedFilesAndAddTokenCount(
  tree: dirTree.DirectoryTree
): Promise<
  | { result: boolean; tokenTotal: number; tree: dirTree.DirectoryTree }
  | "timeoutFailed"
> {
  const { worker, promise } = runWorker(
    path.join(__dirname, "worker-clean-dirtree.js"),
    tree
  );
  const timeout = createTimeoutPromise(3000);
  const result = await Promise.race([promise, timeout]);
  worker.terminate();
  if (result === "timeoutFailed") {
    return "timeoutFailed";
  } else {
    return result as {
      result: boolean;
      tokenTotal: number;
      tree: dirTree.DirectoryTree;
    };
  }
}

export async function flattenFileTreeForCheckbox(
  fileTree: dirTree.DirectoryTree
): Promise<CheckboxInput[] | "timeoutFailed"> {
  const { worker, promise } = runWorker(
    path.join(__dirname, "worker-flatten-tree-for-checkbox.js"),
    fileTree
  );
  const timeout = createTimeoutPromise(2000);
  const result = await Promise.race([promise, timeout]);
  worker.terminate();
  if (result === "timeoutFailed") {
    return "timeoutFailed";
  } else {
    return result as CheckboxInput[];
  }
}

export async function removeDeselectedItems(
  tree: dirTree.DirectoryTree,
  user_selection: string[]
): Promise<
  | { result: boolean; tokenTotal: number; tree: dirTree.DirectoryTree }
  | "timeoutFailed"
> {
  const { worker, promise } = runWorker(
    path.join(__dirname, "worker-remove-deselected.js"),
    { tree, user_selection }
  );
  const timeout = createTimeoutPromise(2000);
  const result = await Promise.race([promise, timeout]);
  worker.terminate();
  if (result === "timeoutFailed") {
    return "timeoutFailed";
  } else {
    return result as {
      result: boolean;
      tokenTotal: number;
      tree: dirTree.DirectoryTree;
    };
  }
}
