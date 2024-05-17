import fs from "node:fs";
import path from "node:path";
import { generatePages } from "./page-generator";
import { parsePlatformIndependentPath } from "./utils";
import { WizardState, ReadyToGeneratePage } from "./types";

async function processFile(filePath: string, wizardState: WizardState): Promise<void> {
  const content = fs.readFileSync(filePath, "utf-8");
  const pages: ReadyToGeneratePage[] = [{
    section: {
      title: path.basename(filePath, path.extname(filePath)),
      permalink: parsePlatformIndependentPath(filePath),
      singleSentenceDescription: "",
      subsections: []
    },
    levels: filePath.split(path.sep).slice(0, -1),
    messages: [{ role: "system", content: "Generate documentation for this content." }, { role: "user", content }]
  }];
  await generatePages(true, pages, path.dirname(filePath), wizardState);
}

async function processDirectory(directoryPath: string, wizardState: WizardState): Promise<void> {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await processDirectory(fullPath, wizardState);
    } else if (entry.isFile() && path.extname(entry.name) === ".txt") {
      await processFile(fullPath, wizardState);
    }
  }
}

export { processFile, processDirectory, processTextFilesInDirectory };

async function processTextFilesInDirectory(directoryPath: string, wizardState: WizardState): Promise<void> {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await processTextFilesInDirectory(fullPath, wizardState);
    } else if (entry.isFile() && path.extname(entry.name) === ".txt") {
      try {
        await processFile(fullPath, wizardState);
      } catch (error) {
        console.error(`Error processing file ${fullPath}:`, error);
      }
    }
  }
}