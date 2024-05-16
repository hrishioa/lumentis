import { RUNNERS } from "./constants";


// ________________________  AI TYPES  ________________________

export type AICallerOptions = {
  // provider: 'anthropic' | 'openai',
  model: string,
  maxOutputTokens: number,
  apiKey?: string,
  streamToConsole?: boolean,
  systemPrompt?: string,
  saveName?: string,
  jsonType?: "parse" | "start_array" | "start_object",
  saveToFilepath?: string,
  prefix?: string,
  continueOnPartialJSON?: boolean
}

export type GenericMessageParam = {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type AICosts = {
  input: number;
  output: number;
  total: number;
}

export type AICallSuccess = {
  success: true;
  outputTokens: number;
  inputTokens?: number;
  cost?: AICosts;
  message: any;
};

export type AICallFailure = {
  success: false;
  rateLimited: boolean;
  error: string;
};

export type AICallResponse = {
  fullMessage: string;
  outputTokens: number;
  inputTokens: number;
}

// ##############################  DOCS OUTLINE  ##############################

export type OutlineSection = LLMOutlineSection & { disabled?: boolean };

export type LLMOutlineSection = {
  title: string;
  permalink: string;
  singleSentenceDescription: string;
  keythingsToCover:string[];
  subsections?: OutlineSection[];
};

export type Outline = {
  title: string;
  sections: OutlineSection[];
};

export type ReadyToGeneratePage = {
  section: OutlineSection;
  levels: string[];
  messages: GenericMessageParam[];
};


// ##############################  WIZARD  ##############################
export type WizardState = Partial<{
  gotDirectoryPermission: boolean;
  smarterModel: string;
  streamToConsole: boolean;
  primarySourceFilename: string;
  loadedPrimarySource: string;
  smarterApikey: string;
  description: string;
  title: string;
  coreThemes: string;
  preferredEditor: string;
  intendedAudience: string;
  ambiguityExplained: string;
  writingExampleFilename: string;
  writingExample: string;
  outlinePrimaryPrompt: string;
  generatedOutline: Outline;
  outlineComments: string;
  ignorePrimarySourceSize: boolean;
  pageGenerationModel: string;
  pageGenerationApikey: string;
  addDiagrams: boolean;
  preferredRunnerForNextra: (typeof RUNNERS)[number]["command"];
  overwritePages: boolean;
  faviconUrl: string;
}>;
