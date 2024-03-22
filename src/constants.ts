import path from "node:path";

export const LUMENTIS_FOLDER = ".lumentis";
export const WIZARD_STATE_FILE = "wizard.json";
export const MESSAGES_FOLDER = "messages";
export const lumentisFolderPath = path.join(process.cwd(), LUMENTIS_FOLDER);
export const wizardStatePath = path.join(lumentisFolderPath, WIZARD_STATE_FILE);

export const WRITING_STYLE_SIZE_LIMIT = 10000;

export const MAX_HEADING_CHAR_LENGTH = 50;
export const NUMBER_OF_CHARACTERS_TO_FLUSH_TO_FILE = 200;

export const CLAUDE_MODELS = [
  {
    name: "Claude 3 Opus",
    model: "claude-3-opus-20240229",
    smarterDescription: "This is the ferrari. Expensive but so good.",
    pageDescription: "Smartest - Use for expensive but awesome results!"
  },
  {
    name: "Claude 3 Sonnet",
    model: "claude-3-sonnet-20240229",
    smarterDescription: "Perfectly fine!",
    pageDescription: "Middle child - still kind of expensive"
  },
  {
    name: "Claude 3 Haiku",
    model: "claude-3-haiku-20240307",
    smarterDescription: "Cheapest, not preferred for this stage",
    pageDescription: "Fast and cheap - get what we pay for"
  }
] as const;

export const EDITORS = [
  { name: "nano", command: "nano" },
  { name: "vim but know you can never leave", command: "vim" },
  { name: "emacs", command: "emacs" }
  // TODO: We should work very hard to re-enable these
  // { name: "vscode", command: "code" },
  // { name: "zed", command: "zed" },
  // { name: "sublime", command: "subl" },
] as const;

export const RUNNERS = [
  {
    name: "bun",
    command: "bun",
    installPrefix: "add"
  },
  {
    name: "npm",
    command: "npm",
    installPrefix: "install"
  },
  {
    name: "yarn",
    command: "yarn",
    installPrefix: "add"
  },
  {
    name: "pnpm",
    command: "pnpm",
    installPrefix: "add"
  }
] as const;
