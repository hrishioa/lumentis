import fs from "node:fs";
import dirTree from "directory-tree";

import type { CheckboxInput } from "src/types";

const { parentPort } = require("node:worker_threads");

function recursivelyFlattenFileTreeForCheckbox(fileTree: dirTree.DirectoryTree, levels = 0): CheckboxInput[] {
  if (fileTree.type === "file") {
    return [
      {
        name: `${String(fileTree.size).padEnd(10, " ")}${"--".repeat(levels)}>${fileTree.name}`,
        value: fileTree.path,
        checked: true
      }
    ];
  }

  if (fileTree.type === "directory") {
    let file_choices = [
      {
        name: `${String(fileTree.size).padEnd(10, " ")}${"--".repeat(levels)}📁${fileTree.name}`,
        value: fileTree.path,
        checked: true
      }
    ];
    if (fileTree.children && fileTree.children.length > 0) {
      file_choices = file_choices.concat(
        fileTree.children.flatMap((child) => {
          return recursivelyFlattenFileTreeForCheckbox(child, levels + 1);
        })
      );
    }
    return file_choices;
  }
  return [];
}

parentPort.on("message", (fileTree: dirTree.DirectoryTree) => {
  const result = recursivelyFlattenFileTreeForCheckbox(fileTree);
  parentPort.postMessage(result);
});
