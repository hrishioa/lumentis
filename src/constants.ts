import path from "node:path";
import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

export const LUMENTIS_FOLDER = ".lumentis";
export const WIZARD_STATE_FILE = "wizard.json";
export const MESSAGES_FOLDER = "messages";
export const lumentisFolderPath = path.join(process.cwd(), LUMENTIS_FOLDER);
export const wizardStatePath = path.join(lumentisFolderPath, WIZARD_STATE_FILE);

export const WRITING_STYLE_SIZE_LIMIT = 10000;

export const MAX_HEADING_CHAR_LENGTH = 50;
export const NUMBER_OF_CHARACTERS_TO_FLUSH_TO_FILE = 200;

// MUST UPDATE `AI_PROVIDERS` IN ai.ts WHEN NEW PROVIDER ADDED
export const AI_MODELS_UI: {
  name: string;
  model: string;
  smarterDescription: string;
  pageDescription: string;
}[] = [
  {
    name: "O3-Mini (High Reasoning)",
    model: "o3-mini-high",
    smarterDescription: "Fast model with high reasoning effort",
    pageDescription: "Fast model optimized for reasoning tasks"
  },
  {
    name: "O3-Mini (Low Reasoning)",
    model: "o3-mini-low",
    smarterDescription: "Fast model with low reasoning effort",
    pageDescription: "Fast model optimized for straightforward tasks"
  },
  {
    name: "Claude 3.5 Sonnet",
    model: "claude-3-5-sonnet-20240620",
    smarterDescription: "King of the hill!",
    pageDescription: "Faster, cheaper, smarter, only model cheaper is Haiku."
  },
  {
    name: "Claude 3 Opus",
    model: "claude-3-opus-20240229",
    smarterDescription: "This is the ferrari. Expensive but so good.",
    pageDescription: "Smartest - Use for expensive but awesome results!"
  },
  {
    name: "Claude 3.5 Sonnet",
    model: "claude-3-5-sonnet-20240620",
    smarterDescription: "Almost as good as Opus, cheaper",
    pageDescription: "New and improved middle child - still kind of expensive but cheaper than Opus or Omni while being competitive on performance."
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
  },
  {
    name: "Gemini 1.5 Flash",
    model: "gemini-1.5-flash-latest",
    smarterDescription: "Fast and cheap, with a lot more output length",
    pageDescription: "For any Google stans"
  },
  {
    name: "Gemini 2.0 Flash",
    model: "gemini-2.0-flash",
    smarterDescription: "Latest Gemini model with multimodal support",
    pageDescription: "Latest and greatest from Google"
  },
  {
    name: "Gemini Flash Thinking",
    model: "gemini-flash-thinking-exp",
    smarterDescription: "Experimental model with enhanced reasoning",
    pageDescription: "Best for complex reasoning tasks"
  },
  {
    name: "Gemini 2.0 Pro",
    model: "gemini-2.0-pro-exp-02-05",
    smarterDescription: "Pro version with balanced performance",
    pageDescription: "Balanced performance for most tasks"
  }
] as const;

// MUST UPDATE `AI_PROVIDERS` IN ai.ts WHEN NEW PROVIDER ADDED
export const AI_MODELS_INFO: Record<
  string,
  {
    provider: "anthropic" | "openai" | "google";
    tokenCountingModel?: string;
    totalTokenLimit: number;
    outputTokenLimit: number;
    inputTokensPerM: number;
    outputTokensPerM: number;
    notes?: string;
    baseModel?: string;
    reasoningEffort?: "high" | "low";
  }
> = {
  "o3-mini-high": {
    provider: "openai",
    tokenCountingModel: "gpt-4",
    totalTokenLimit: 128000,
    outputTokenLimit: 50000,
    inputTokensPerM: 1.32,
    outputTokensPerM: 5.28,
    baseModel: "o3-mini",
    reasoningEffort: "high"
  },
  "o3-mini-low": {
    provider: "openai",
    tokenCountingModel: "gpt-4",
    totalTokenLimit: 128000,
    outputTokenLimit: 50000,
    inputTokensPerM: 1.10,
    outputTokensPerM: 4.40,
    baseModel: "o3-mini",
    reasoningEffort: "low"
  },
  "claude-3-5-sonnet-20240620": {
    provider: "anthropic",
    totalTokenLimit: 200000,
    outputTokenLimit: 4096,
    inputTokensPerM: 3,
    outputTokensPerM: 15
  },
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
  },
  "gemini-1.5-flash-latest": {
    provider: "google",
    totalTokenLimit: 1000000,
    outputTokenLimit: 8192,
    inputTokensPerM: 0.75,
    outputTokensPerM: 0.53,
    notes: `
Please be aware that Google offers both Free and Paid plans, determined by the API key used.
We list costs for the Paid plan. Free plan costs $0.00, but means Google will use your data.
See: ai.google.dev/gemini-api/terms`
  },
  "gemini-2.0-flash": {
    provider: "google",
    totalTokenLimit: 1048576,
    outputTokenLimit: 8192,
    inputTokensPerM: 0.75,
    outputTokensPerM: 0.53,
    notes: `
Please be aware that Google offers both Free and Paid plans, determined by the API key used.
We list costs for the Paid plan. Free plan costs $0.00, but means Google will use your data.
See: ai.google.dev/gemini-api/terms`
  },
  "gemini-flash-thinking-exp": {
    provider: "google",
    totalTokenLimit: 1048576,
    outputTokenLimit: 8192,
    inputTokensPerM: 0.75,
    outputTokensPerM: 0.53,
    notes: `
Please be aware that Google offers both Free and Paid plans, determined by the API key used.
We list costs for the Paid plan. Free plan costs $0.00, but means Google will use your data.
See: ai.google.dev/gemini-api/terms`
  },
  "gemini-2.0-pro-exp-02-05": {
    provider: "google",
    totalTokenLimit: 1048576,
    outputTokenLimit: 8192,
    inputTokensPerM: 0.75,
    outputTokensPerM: 0.53,
    notes: `
Please be aware that Google offers both Free and Paid plans, determined by the API key used.
We list costs for the Paid plan. Free plan costs $0.00, but means Google will use your data.
See: ai.google.dev/gemini-api/terms`
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

export const GOOGLE_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE
  }
];
