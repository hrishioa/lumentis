import fs from "node:fs";
import { countTokens } from "@anthropic-ai/tokenizer";
import dirTree from "directory-tree";
import { parsePlatformIndependentPath } from "src/utils";
import { checkFileIsReadable } from "./utils";

const { parentPort } = require("node:worker_threads");

let folderTokenTotal = 0;

function recursivelyRemoveExcludedFilesAndAddTokenCount(
  tree: dirTree.DirectoryTree
) {
  tree.size = 0;
  if (tree.children && tree.children.length > 0) {
    tree.children = tree.children
      .filter((child) => {
        if (child.type === "file") {
          return checkFileIsReadable(child.name);
        } else if (
          child.type === "directory" &&
          child.children &&
          child.children.length > 0
        ) {
          recursivelyRemoveExcludedFilesAndAddTokenCount(child);
          return child.children.length > 0;
        } else {
          return false;
        }
      })
      .sort((a, b) =>
        a.type === "file" && b.type !== "file"
          ? -1
          : a.type !== "file" && b.type === "file"
            ? 1
            : 0
      );
    for (const child of tree.children) {
      if (child.type === "file") {
        const fileTokens = countTokens(
          fs.readFileSync(parsePlatformIndependentPath(child.path), "utf-8")
        ); // This gets expensive with large folders. User issue?
        folderTokenTotal += fileTokens;
        child.size = fileTokens;
      }
    }
  }
  if (tree.type === "file") {
    console.log(
      "Should not be here: recursivelyRemoveExcludedFilesAndAddTokenCount called on a file"
    );
    return checkFileIsReadable(tree.name);
  } else if (tree.type === "directory" && tree.children) {
    if (tree.children.length > 0) {
      tree.size = tree.children.reduce((acc, child) => acc + child.size, 0);
      return true;
    } else {
      return false; // return if empty directory
    }
  } else {
    return false; // return if type is questionable
  }
}

parentPort.on("message", (dir_tree: dirTree.DirectoryTree) => {
  const result = recursivelyRemoveExcludedFilesAndAddTokenCount(dir_tree);
  parentPort.postMessage({
    result: result,
    tokenTotal: folderTokenTotal,
    tree: dir_tree
  });
});
