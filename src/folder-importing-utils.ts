#!/usr/bin/env node
import mime from 'mime-types';
import dirTree from "directory-tree";
import fs from "node:fs";
import path from "node:path";
import { countTokens } from "@anthropic-ai/tokenizer";

import { parsePlatformIndependentPath } from "./utils";

export var folderTokenTotal: number = 0;
export function resetFolderTokenTotal() {
    folderTokenTotal = 0;
}

// I did a bunch of scrolling through mime types to come up with this list (https://www.iana.org/assignments/media-types/media-types.xhtml)
// However there's still possibly a bunch missing.
// Be aware that not all file types are reasable with the fs.readFileSync
// we're currently using (eg: microsoft docs and excel). To add the ability
// to read these, you'll also need to add a special file reader for that file
// type.
const readableMimeTypes = ['text', 'message']
const readableApplicationSubtypes = ['json', 'xml', 'yaml', 'rtf', 'rtx']
// TODO: Does the below require `parsePlatformIndependentPath`?
const programming_extensions = JSON.parse(fs.readFileSync(path.join(__dirname,'..', 'assets', 'programming_language_extensions.json'), 'utf-8'));
const allowed_extensions = programming_extensions.filter(language => language.type == 'programming').map(language => language.extensions).flat();


// Extensions and paths to exclude from the folder tree.
// This is a list of extensions that are generally not readable by AI models.
// Please do add to it. We'll then do an additional file check on each file,
// but this should make those operations less heavy.
const excludeExtensions = [
    '.pdf', '.mp4', '.jpg', '.jpeg', '.png', '.o', '.mov', '.mp3',
    '.mpg', '.mpeg', '.avi', '.wmv', '.doc', '.docx', '.xls', '.xlsx',
    '.ppt', '.pptx', '.exe', '.dll', '.so', '.dylib', '.a', '.lib',
    '.obj', '.pyc', '.class', '.jar', '.war', '.ear', '.zip', '.tar',
    '.class', '.jar', '.war', '.ear', '.zip', '.tar', '.gz', '.bz2',
    '.xz', '.7z', '.rar', '.tgz', '.tar.gz', '.tar.bz2', '.tar.xz',
    '.tar.7z', '.tar.Z', '.tar.lz', '.tar.lzma', '.tar.Z', '.tar.lz4',
    '.tar.lzop', '.tar.zst', '.tar.sz', '.tar.br', '.tar.bz', '.tar.lzo',
    '.gif', '.bmp', '.svg', '.webp', '.ico', '.tif', '.tiff', '.heif',
    '.heic', '.mkv', '.flv', '.webm', '.wav', '.aac', '.flac', '.ogg'
]
const folderTreeExclusions = [
    /^.*\/\.bin$/, /^.*\/node_modules$/,
    /^.*\/\.vscode$/, /^.*\/\.git/, /^.*\/test$/,
    /^.*\/dist$/, /^.*\/build$/, /^.*\/out$/, /^.*\/target$/,
    /^.*\/venv$/, /^.*\/__pycache__$/, /^.*\/\.idea$/, /^.*\/\.DS_Store$/,
]
export const allExclusions = folderTreeExclusions.concat(excludeExtensions.map(ex => new RegExp(`.*${ex}$`)));



// This is using the Programming_Languages_Extensions.json from ppisarczyk: https://gist.github.com/ppisarczyk/43962d06686722d26d176fad46879d41
// I considered transforming it into just a list of programming extensions, 
// but thought it might be more flexible fo use the whole thing in case we
// want to add data languages/specifically exclude certain languages.
// This helps us do so. I'm pretty sure it doesn't include compiled files.
function checkIfFileIsProgrammingLanguage(filename: string) {
    const extension = '.'+filename.split('.').pop();
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
    const [type, subtype] = mimeType.split('/');

    if (readableMimeTypes.includes(type)) {
        return true;
    } else if (type === 'application' && readableApplicationSubtypes.some(sub => subtype.includes(sub))) {
        return true;
    }
    return false;
}



export function recursivelyRemoveExcludedFilesAndAddTokenCount(
    tree,
    user_selection: string[] | false = false
) {
    tree.size = 0;
    if (tree.children && tree.children.length > 0) {
        tree.children = tree.children.filter(
            (child) => {
               if (child.type === 'file') {
                    if (user_selection) { 
                        return user_selection.includes(child.path);
                    }
                    return checkFileIsReadable(child.name);
                } else {
                    if (user_selection && !user_selection.includes(child.path)) { 
                        return false;
                    }
                    recursivelyRemoveExcludedFilesAndAddTokenCount(child, user_selection);
                    return child.children.length > 0;
                }
            }
        ).sort((a,b) => a.type === 'file' && b.type !== 'file' ? -1 : (a.type !== 'file' && b.type === 'file' ? 1: 0))
        tree.children.forEach((child) => {
            if (child.type === 'file') {
                var fileTokens = child.size;
                if (!user_selection) {
                    fileTokens = countTokens(fs.readFileSync(parsePlatformIndependentPath(child.path), 'utf-8'));
                }
                folderTokenTotal += fileTokens;
                child.size = fileTokens;
            } 
        });
    }
    if (tree.type === 'directory' && tree.children.length > 0) {
        tree.size = tree.children.reduce((acc, child) => acc + child.size, 0);
    }
    if (tree.type === 'file') {
        return checkFileIsReadable(tree.name);
    }
    if (tree.type == 'directory' && tree.children.length == 0) {
        tree.size = tree.children.reduce((acc, child) => acc + child.size, 0);
        return false
    }


    return false; // This gets returned if it's a directory without children or the type is questionable
}

export function recursivelyFlattenFileTreeForCheckbox(fileTree: dirTree.DirectoryTree, levels = 0) {
    if (fileTree.type === 'file') {
        return [{
            name: `${String(fileTree.size).padEnd(10, ' ')}${'--'.repeat(levels)}>${fileTree.name}`,
            value: fileTree.path,
            checked: true
        }]
    }
    if (fileTree.type === 'directory') {
        var file_choices = [
            {
                name: `${String(fileTree.size).padEnd(10, ' ')}${'--'.repeat(levels)}📁${fileTree.name}`,
                value: fileTree.path,
                checked: true
            }
        ];
        if (fileTree.children && fileTree.children.length > 0) {
            file_choices = file_choices.concat(fileTree.children.map((child) => {
                return recursivelyFlattenFileTreeForCheckbox(child, levels + 1)
            }).flat())
        }
        return file_choices
    }
    return []
}

