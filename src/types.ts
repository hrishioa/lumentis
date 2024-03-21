import type { MessageParam } from "@anthropic-ai/sdk/resources";

export type OutlineSection = LLMOutlineSection & { disabled?: boolean };

export type LLMOutlineSection = {
  title: string;
  permalink: string;
  singleSentenceDescription: string;
  subsections?: OutlineSection[];
};

export type Outline = {
  title: string;
  sections: OutlineSection[];
};

export type ReadyToGeneratePage = {
  section: OutlineSection;
  levels: string[];
  messages: MessageParam[];
};

export type WizardState = Partial<{
  gotDirectoryPermission: boolean;
  smarterModel: string;
  streamToConsole: boolean;
  primarySourceFilename: string;
  loadedPrimarySource: string;
  anthropicKey: string;
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
  pageGenerationModel: string;
  skipDiagrams: boolean;
  preferredRunnerForNextra: string;
  overwritePages: boolean;
  faviconUrl: string;
}>;
