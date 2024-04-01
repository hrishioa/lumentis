const { parentPort } = require('node:worker_threads');

import dirTree from "directory-tree";
import { allExclusions } from "./utils";


// Wrap dirTree as a Promise
function getFileTree(filepath: string): dirTree.DirectoryTree {
    const tree = dirTree(filepath, {
        exclude: allExclusions,
        attributes: ["size", "type", "extension"]
    });
    console.log("Finished getting file tree")
    return tree

}

parentPort.on('message', (filepath: string) => {
    const result = getFileTree(filepath);
    parentPort.postMessage(result);
});
