import path from "node:path";

export const LUMENTIS_FOLDER = ".lumentis";
export const WIZARD_STATE_FILE = "wizard.json";
export const MESSAGES_FOLDER = "messages";
export const lumentisFolderPath = path.join(process.cwd(), LUMENTIS_FOLDER);
export const wizardStatePath = path.join(lumentisFolderPath, WIZARD_STATE_FILE);

export const WRITING_STYLE_SIZE_LIMIT = 10000;

export const MAX_HEADING_CHAR_LENGTH = 50;
export const NUMBER_OF_CHARACTERS_TO_FLUSH_TO_FILE = 200;

// MUST UPDATE `AI_PROVIDERS` IN ai.ts WHEN NEW PROVIDER ADDED
export const AI_MODELS_UI = [
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
  },
  {
    name: "OpenAI GPT-4 Omni",
    model: "gpt-4o",
    smarterDescription: "Worse than Opus, far better rate limits",
    pageDescription: "If you like OpenAI this is the one"
  }
] as const;

// MUST UPDATE `AI_PROVIDERS` IN ai.ts WHEN NEW PROVIDER ADDED
export const AI_MODELS_INFO: Record<
  string,
  {
    provider: "anthropic" | "openai";
    tokenCountingModel?: string;
    totalTokenLimit: number;
    outputTokenLimit: number;
    inputTokensPerM: number;
    outputTokensPerM;
  }
> = {
  "claude-3-opus-20240229": {
    provider: "anthropic",
    totalTokenLimit: 200000,
    outputTokenLimit: 4096,
    inputTokensPerM: 15,
    outputTokensPerM: 75
  },
  "claude-3-sonnet-20240229": {
    provider: "anthropic",
    totalTokenLimit: 200000,
    outputTokenLimit: 4096,
    inputTokensPerM: 3,
    outputTokensPerM: 15
  },
  "claude-3-haiku-20240307": {
    provider: "anthropic",
    totalTokenLimit: 200000,
    outputTokenLimit: 4096,
    inputTokensPerM: 0.25,
    outputTokensPerM: 1.25
  },
  "gpt-4o": {
    provider: "openai",
    tokenCountingModel: "gpt-4", // required bc OpenAI token counting is frustrating
    totalTokenLimit: 128000,
    outputTokenLimit: 4096,
    inputTokensPerM: 5,
    outputTokensPerM: 15
  }
} as const;

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
