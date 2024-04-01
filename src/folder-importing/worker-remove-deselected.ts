import fs from "node:fs";
import { countTokens } from "@anthropic-ai/tokenizer";
import dirTree from "directory-tree";
import { parsePlatformIndependentPath } from "src/utils";

const { parentPort } = require("node:worker_threads");

let folderTokenTotal = 0;

function recursivelyRemoveDeselectedItems(
  tree: dirTree.DirectoryTree,
  user_selection: string[]
): boolean {
  tree.size = 0;

  if (tree.children && tree.children.length > 0) {
    tree.children = tree.children.filter((child) => {
      if (child.type === "file") {
        return user_selection.includes(child.path);
      } else if (
        child.type === "directory" &&
        child.children &&
        child.children.length > 0
      ) {
        if (!user_selection.includes(child.path)) {
          return false;
        }
        recursivelyRemoveDeselectedItems(child, user_selection);
        return child.children.length > 0;
      } else {
        return false;
      }
    });
    for (const child of tree.children) {
      if (child.type === "file") {
        folderTokenTotal += child.size;
      }
    }
  }

  if (tree.type === "file") {
    console.log(
      "Should not be here: recursivelyRemoveDeselectedItems called on a file"
    );
    return user_selection.includes(tree.path);
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

parentPort.on(
  "message",
  ({
    tree,
    user_selection
  }: { tree: dirTree.DirectoryTree; user_selection: string[] }) => {
    const result = recursivelyRemoveDeselectedItems(tree, user_selection);
    parentPort.postMessage({
      result: result,
      tokenTotal: folderTokenTotal,
      tree: tree
    });
  }
);
