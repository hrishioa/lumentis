import type { MessageParam } from "@anthropic-ai/sdk/resources";
import { RUNNERS } from "./constants";

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
  messages: MessageParam[];
};

export type CheckboxInput = {
  name: string;
  value: string;
  checked: boolean;
};

export type WizardState = Partial<{
  gotDirectoryPermission: boolean;
  smarterModel: string;
  streamToConsole: boolean;
  primarySourceAccessName: string;
  primarySourceType: 'youtube' | 'file' | 'folder' | 'freetext';
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
  ignorePrimarySourceSize: boolean;
  pageGenerationModel: string;
  addDiagrams: boolean;
  preferredRunnerForNextra: (typeof RUNNERS)[number]["command"];
  overwritePages: boolean;
  faviconUrl: string;
}>;
