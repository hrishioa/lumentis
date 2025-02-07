#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { countTokens } from "@anthropic-ai/tokenizer";
import {
  Separator,
  checkbox,
  confirm,
  editor,
  input,
  password,
  select
} from "@inquirer/prompts";
import { YoutubeTranscript } from "youtube-transcript";
import { callLLM, getCallCosts, getPrimarySourceBudget } from "./ai";
import {
  AI_MODELS_INFO,
  AI_MODELS_UI,
  EDITORS,
  LUMENTIS_FOLDER,
  RUNNERS,
  WRITING_STYLE_SIZE_LIMIT,
  lumentisFolderPath,
  wizardStatePath
} from "./constants";
import { generatePages, idempotentlySetupNextraDocs } from "./page-generator";
import {
  getAudienceInferenceMessages,
  getDescriptionInferenceMessages,
  getOutlineInferenceMessages,
  getOutlineRegenerationInferenceMessages,
  getPageGenerationInferenceMessages,
  getQuestionsInferenceMessages,
  getThemeInferenceMessages,
  getTitleInferenceMessages
} from "./prompts";
import {
  AICallerOptions,
  Outline,
  OutlineSection,
  ReadyToGeneratePage,
  WizardState
} from "./types";
import { isCommandAvailable, parsePlatformIndependentPath } from "./utils";

async function runWizard() {
  function saveState(state: WizardState) {
    const keysToWrite = Object.keys(state).filter((k) => !k.includes("Apikey"));
    const stateToWrite = keysToWrite.reduce((acc, key) => {
      acc[key] = state[key];
      return acc;
    }, {} as WizardState);
    if (!fs.existsSync(lumentisFolderPath)) fs.mkdirSync(lumentisFolderPath);
    fs.writeFileSync(wizardStatePath, JSON.stringify(stateToWrite, null, 2));
  }

  const wizardState: WizardState = fs.existsSync(wizardStatePath)
    ? JSON.parse(fs.readFileSync(wizardStatePath, "utf-8"))
    : {};

  // prettier-ignore
  console.log(
    `Welcome to Lumentis! Let's build you some docs. Some things to keep in mind:
- I'll be saving config files (state, LLM messages) in a folder called ${LUMENTIS_FOLDER} in the current directory.
- If you'd like to repeat any steps, Ctrl+C and just start over.
`
  );

  // Ask for directory permissions

  if (!wizardState.gotDirectoryPermission) {
    wizardState.gotDirectoryPermission = await confirm({
      message: "Are you in a clean directory I can start saving things to?",
      default: true,
      transformer: (answer) => (answer ? "👍" : "👎")
    });

    if (!wizardState.gotDirectoryPermission) {
      console.log(
        "No problem! Start me again in a clean directory. Bye for now!"
      );
      return;
    }
  }

  saveState(wizardState);

  // Ask for AI model to use

  wizardState.smarterModel = await select({
    message:
      "Pick a model for meta inference.\n Smarter is preferred, you can use a cheaper model for the actual writing later.",
    choices: [
      ...AI_MODELS_UI.map((model) => ({
        name: model.name,
        value: model.model,
        description: model.smarterDescription
      })),
      new Separator()
    ],
    default: wizardState.smarterModel || AI_MODELS_UI[0].model
  });

  saveState(wizardState);

  if (AI_MODELS_INFO[wizardState.smarterModel].notes) {
    console.log(AI_MODELS_INFO[wizardState.smarterModel].notes);
  }
  // Ask to stream output to console

  wizardState.streamToConsole = await confirm({
    message:
      "Do you want to stream outputs to console? \n Looks awesome but clutters things up:",
    default: wizardState.streamToConsole || false,
    transformer: (answer) => (answer ? "👍" : "👎")
  });

  saveState(wizardState);

  // Ask for transcript/text file
  // TODO: if they give a different primary source than already exists, wipe all subsequent defaults

  const fileName = await input({
    message:
      "What's your primary source? \n Drag a text file (or youtube link, experimental) in here, or leave empty/whitespace to open an editor: ",
    default: wizardState.primarySourceFilename || undefined,
    validate: async (filename) => {
      if (filename?.trim()) {
        if (
          (filename === wizardState.primarySourceFilename ||
            filename === parsePlatformIndependentPath(filename)) &&
          wizardState.loadedPrimarySource
        )
          return true;
        if (filename.includes("youtube.com")) {
          try {
            const transcript =
              await YoutubeTranscript.fetchTranscript(filename);
            wizardState.loadedPrimarySource = transcript
              .map((line) => line.text)
              .join("\n");
            wizardState.primarySourceFilename = filename;
          } catch (err) {
            return `Looked like a youtube video - Couldn't fetch transcript from ${filename}: ${err}`;
          }
        } else if (!fs.existsSync(parsePlatformIndependentPath(filename))) {
          return `File not found - tried to load ${filename}. Try again.`;
        } else {
          try {
            const dataFromFile = fs.readFileSync(
              parsePlatformIndependentPath(filename),
              "utf-8"
            );
            wizardState.loadedPrimarySource = dataFromFile;
            wizardState.primarySourceFilename =
              parsePlatformIndependentPath(filename);
          } catch (err) {
            return `Couldn't read file - tried to load ${filename}. Try again.`;
          }
        }
      }
      return true;
    }
  });

  saveState(wizardState);

  if (!wizardState.loadedPrimarySource) {
    const editorName = await select({
      message:
        "Because there's a chance you never changed $EDITOR from vim, pick an editor!",
      choices: EDITORS.filter((editor) =>
        isCommandAvailable(editor.command)
      ).map((editor) => ({
        name: editor.name,
        value: editor.command
      })),
      default: wizardState.preferredEditor || EDITORS[0].command
    });

    process.env.EDITOR = editorName;
    wizardState.preferredEditor = editorName;

    const dataFromEditor = await editor({
      message: `Press enter to open ${editorName} to enter your content.`,
      validate: (input) => {
        if (!input.trim()) return "Please enter something - ideally a lot!";
        return true;
      },
      default: wizardState.loadedPrimarySource
    });

    wizardState.loadedPrimarySource = dataFromEditor;
  }

  saveState(wizardState);

  const primarySourceTokens = countTokens(wizardState.loadedPrimarySource);
  const PRIMARYSOURCE_BUDGET = getPrimarySourceBudget(wizardState.smarterModel);

  if (primarySourceTokens > PRIMARYSOURCE_BUDGET) {
    wizardState.ignorePrimarySourceSize = await confirm({
      message: `Your content looks a little too large by about ${
        primarySourceTokens - PRIMARYSOURCE_BUDGET
      } tokens (leaving some wiggle room). Generation might fail (if it does, you can always restart and adjust the source). Continue anyway?`,
      default: wizardState.ignorePrimarySourceSize || false,
      transformer: (answer) => (answer ? "👍" : "👎")
    });

    if (!wizardState.ignorePrimarySourceSize) {
      console.log("No problem! You can run me again to adjust the source.");
      return;
    }
  }

  const smarterModelProvider =
    AI_MODELS_INFO[wizardState.smarterModel]?.provider;

  if (!smarterModelProvider) {
    console.log(
      "Couldn't find the provider for the model you selected. Please run again?"
    );
    process.exit(1);
  }

  const cheapestSmartProviderModel = Object.entries(AI_MODELS_INFO)
    .filter(([model, info]) => info.provider === smarterModelProvider)
    .sort((a, b) => a[1].outputTokensPerM - b[1].outputTokensPerM)[0];

  // Ask for AI API key

  wizardState.smarterApikey =
    (await password({
      message: `Please enter your ${smarterModelProvider.toUpperCase()} API key.\n (You can leave this blank if it's already in the ENV variable.): `,
      mask: "*",
      validate: async (key) => {
        const testResponse = await callLLM(
          [{ role: "user", content: "What is your name?" }],
          {
            model: cheapestSmartProviderModel[0],
            maxOutputTokens: 10,
            apiKey: key || undefined
          }
        );

        if (testResponse.success) return true;

        if (key.trim()) return `Your key didn't work. Try again?`;
        else return `The key in your env didn't work. Try again?`;
      }
    })) || undefined;

  // Ask for source description

  const baseOptions: AICallerOptions = {
    model: wizardState.smarterModel,
    maxOutputTokens: 2048,
    apiKey: wizardState.smarterApikey,
    streamToConsole: wizardState.streamToConsole
  };

  const descriptionInferenceMessages = getDescriptionInferenceMessages(
    wizardState.loadedPrimarySource
  );

  const description = await input({
    message: `Do you have a short description of your source?\n Who's talking, what type of content is it etc.\n (Leave empty to generate - costs $${getCallCosts(
      descriptionInferenceMessages,
      700,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default: wizardState.description || undefined
  });

  if (description.trim()) {
    wizardState.description = description;
  } else {
    const generatedDescription = await callLLM(descriptionInferenceMessages, {
      ...baseOptions,
      saveName: "description"
    });

    if (generatedDescription.success) {
      console.log(
        `Generated description \n(edit this in ${wizardStatePath} if you need to and restart!): ${generatedDescription.message}\n\n`
      );

      wizardState.description = generatedDescription.message;
    } else {
      wizardState.description = await input({
        message: `Couldn't generate. Please type one in? `,
        default: wizardState.description,
        validate: (input) => !!input.trim() || "Please enter a description."
      });
    }
  }

  saveState(wizardState);

  if (!wizardState.description?.trim())
    throw new Error("Can't continue without a description!");

  const titleInferenceMessages = getTitleInferenceMessages(
    wizardState.loadedPrimarySource,
    wizardState.description
  );

  // Ask for title

  const title = await input({
    message: `Do you have a short title or name?\n (Leave empty to generate - costs $${getCallCosts(
      titleInferenceMessages,
      400,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default: wizardState.title || undefined
  });

  if (title.trim()) {
    wizardState.title = title;
  } else {
    // note: changed maxtokens from 800 to 700, don't think the title needs more than the description
    const titleOptionsResponse = await callLLM(titleInferenceMessages, {
      ...baseOptions,
      saveName: "title",
      jsonType: "start_array"
    });

    if (titleOptionsResponse.success) {
      const titleOptions: string[] = titleOptionsResponse.message; // I don't understand why this has to be type 'any' but it does
      const selectedAnswer: string = await select({
        message: "Pick your favorite or enter a new one: ",
        choices: [
          ...titleOptions.map((title: string) => ({
            name: title,
            value: title
          })),
          ...[
            new Separator(),
            { name: "Enter a new one", value: "__new__" },
            new Separator()
          ]
        ]
      });

      wizardState.title =
        selectedAnswer === "__new__"
          ? await input({ message: "Enter a new title: " })
          : selectedAnswer;
    } else {
      wizardState.title = await input({
        message: `Couldn't generate. Please type one in? `,
        default: wizardState.title,
        validate: (input) => !!input.trim() || "Please enter a title."
      });
    }
  }

  saveState(wizardState);

  // Ask for favicon URL

  const urlPattern =
    /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
  wizardState.faviconUrl = await input({
    message: "Choose your own favicon! \nPlease provide a URL only.",
    default:
      wizardState.faviconUrl ||
      "https://raw.githubusercontent.com/HebeHH/lumentis/choose-favicon/assets/default-favicon.png",
    // change the default to the permanent raw URL of assets/default-favicon.png, once on github
    validate: (favicon_url) => {
      if (!urlPattern.test(favicon_url.trim())) {
        console.log("hi");
        console.log(favicon_url);
        return `Not a valid URL - ${favicon_url.trim()}. Try again.`;
      }
      return true;
    }
  });

  saveState(wizardState);

  // Ask for theme/keywords

  const themesInferenceMessages = getThemeInferenceMessages(
    wizardState.loadedPrimarySource
  );

  const themesFromUser = await input({
    message: `Do you have any core themes or keywords about the source or the intended audience?\n (Leave empty to generate - costs $${getCallCosts(
      themesInferenceMessages,
      400,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default: wizardState.coreThemes || undefined
  });

  if (themesFromUser.trim()) {
    wizardState.coreThemes = themesFromUser.trim();
  } else {
    const themesOptionsResponse = await callLLM(themesInferenceMessages, {
      ...baseOptions,
      saveName: "themes",
      jsonType: "start_array"
    });

    if (themesOptionsResponse.success) {
      const selectedThemes = await checkbox({
        message: "Deselect any you don't want: ",
        choices: themesOptionsResponse.message.map((theme: string) => ({
          name: theme,
          value: theme,
          checked: true
        }))
      });

      const newThemesFromUser = await input({
        message: "Enter any more (leave empty for none): "
      });

      wizardState.coreThemes = (
        selectedThemes.join(", ") +
        " " +
        newThemesFromUser
      ).trim();
    } else {
      wizardState.coreThemes = await input({
        message: `Couldn't generate. Please type some in? `,
        default: wizardState.coreThemes,
        validate: (input) => !!input.trim() || "Please enter a theme."
      });
    }
  }

  saveState(wizardState);

  // Ask for Audience

  const audienceInferenceMessages = getAudienceInferenceMessages(
    wizardState.loadedPrimarySource,
    wizardState.description
  );

  const audienceFromUser = await input({
    message: `Do you have any intended audience in mind?\n (Leave empty to generate - costs $${getCallCosts(
      audienceInferenceMessages,
      400,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default:
      (wizardState.intendedAudience && wizardState.intendedAudience) ||
      undefined
  });

  if (audienceFromUser.trim()) {
    wizardState.intendedAudience = audienceFromUser.trim();
  } else {
    const audienceOptionsResponse = await callLLM(audienceInferenceMessages, {
      ...baseOptions,
      saveName: "audience",
      jsonType: "start_array"
    });

    if (audienceOptionsResponse.success) {
      const selectedAudience: string[] = await checkbox({
        message: "Deselect any you don't want: ",
        choices: audienceOptionsResponse.message.map((audience: string) => ({
          name: audience,
          value: audience,
          checked: true
        }))
      });

      const newAudienceFromUser = await input({
        message: "Enter any more (leave empty for none): "
      });

      wizardState.intendedAudience = (
        selectedAudience.join(", ") +
        " " +
        newAudienceFromUser
      ).trim();
    } else {
      wizardState.intendedAudience = await input({
        message: `Couldn't generate. Please type some keywords in? `,
        default: wizardState.intendedAudience,
        validate: (input) =>
          !!input.trim() || "Please enter some words describing the audience."
      });
    }
  }

  saveState(wizardState);

  // AI asks questions back

  const questionsMessages = getQuestionsInferenceMessages(
    wizardState.loadedPrimarySource,
    wizardState.description,
    wizardState.ambiguityExplained
  );

  const questionPermission = await confirm({
    message: `Are you okay ${
      wizardState.ambiguityExplained ? "re" : ""
    }answering some questions about things that might not be well explained in the primary source?\n (Costs ${getCallCosts(
      questionsMessages,
      2048,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default: false,
    transformer: (answer) => (answer ? "👍" : "👎")
  });

  if (questionPermission) {
    const questionsResponse = await callLLM(
      questionsMessages,
      {
        ...baseOptions,
        saveName: "questions",
        jsonType: "start_array",
        maxOutputTokens: 2048
      } // overwrites maxOutputTokens
    );

    if (questionsResponse.success) {
      if (!wizardState.preferredEditor) {
        const editorName = await select({
          message:
            "Because there's a chance you never changed $EDITOR from vim, pick an editor!",
          choices: EDITORS.filter((editor) =>
            isCommandAvailable(editor.command)
          ).map((editor) => ({
            name: editor.name,
            value: editor.command
          })),
          default: wizardState.preferredEditor || EDITORS[0].command
        });

        wizardState.preferredEditor = editorName;
      }

      process.env.EDITOR = wizardState.preferredEditor;

      const dataFromEditor = await editor({
        message: `Opening ${process.env.EDITOR} to answer:`,
        waitForUseInput: false,
        default: `Here are some questions: \n${questionsResponse.message
          .map(
            (question: string, index: number) =>
              `${index + 1}. ${question}\n\nAnswer: \n\n`
          )
          .join("\n")}`
      });

      wizardState.ambiguityExplained =
        (wizardState.ambiguityExplained || "") + dataFromEditor;
    } else {
      console.log("\n\nCould not generate. Lets skip this for now.");
    }
  }

  saveState(wizardState);

  // Ask for writing style

  const writingExampleFilename = await input({
    message:
      "Do you have an example of writing style you want to add in (adds cost but improves output, \nleave blank to skip. Drag in a file): ",
    default: wizardState.writingExampleFilename || undefined,
    validate: (filename) => {
      if (
        filename?.trim() &&
        !fs.existsSync(parsePlatformIndependentPath(filename))
      )
        return `File not found - tried to load ${filename}. Try again.`;
      return true;
    }
  });

  if (writingExampleFilename.trim()) {
    wizardState.writingExampleFilename = parsePlatformIndependentPath(
      writingExampleFilename
    );

    const dataFromFile = fs.readFileSync(
      wizardState.writingExampleFilename,
      "utf-8"
    );

    wizardState.writingExample = dataFromFile.substring(
      0,
      WRITING_STYLE_SIZE_LIMIT
    );
  }

  saveState(wizardState);

  // Ask AI for outline

  const outlineQuestions = getOutlineInferenceMessages(
    wizardState.title,
    wizardState.loadedPrimarySource,
    wizardState.description,
    wizardState.coreThemes,
    wizardState.intendedAudience,
    wizardState.ambiguityExplained,
    wizardState.writingExample
  );

  const previousOutlineInvalidated =
    wizardState.outlinePrimaryPrompt &&
    wizardState.outlinePrimaryPrompt !== outlineQuestions[0].content;

  if (!wizardState.generatedOutline || previousOutlineInvalidated) {
    const confirmOutline = await confirm({
      message: `We're about to generate the outline (Costs $${getCallCosts(
        outlineQuestions,
        AI_MODELS_INFO[wizardState.smarterModel].outputTokenLimit - 1,
        wizardState.smarterModel
      ).toFixed(4)}). Confirm: `,
      default: true,
      transformer: (answer) => (answer ? "👍" : "👎")
    });

    if (!confirmOutline) {
      console.log(
        "No problem! You can run me again to generate the outline later."
      );
      return;
    }

    const outlineResponse = await callLLM(outlineQuestions, {
      ...baseOptions,
      saveName: "outline",
      jsonType: "start_object",
      maxOutputTokens:
        AI_MODELS_INFO[wizardState.smarterModel].outputTokenLimit - 1,
      continueOnPartialJSON: true
    });

    if (outlineResponse.success) {
      const outline : Outline = outlineResponse.response;
      outline.sections.forEach((section) => {
        if (section.permalink === 'introduction' || section.permalink === 'Introduction' || section.permalink === 'summary') {
          section.permalink = 'index'
        }

      })
      wizardState.generatedOutline = outlineResponse.response;
    } else {
      console.log(
        "Couldn't generate the outline. You can run me again to retry."
      );
      return;
    }
  }

  saveState(wizardState);

  function deleteDisabledSectionsAndClean(
    sections: OutlineSection[]
  ): OutlineSection[] {
    return sections
      .filter((section) => !section.disabled)
      .map((section) => {
        if (section.subsections)
          section.subsections = deleteDisabledSectionsAndClean(
            section.subsections
          );
        delete section.disabled;
        return section;
      });
  }

  // Actually generate the docs

  while (true) {
    if (!wizardState.generatedOutline) {
      console.log("No outline generated. Exiting. Run me again perhaps?");
      return;
    }

    // Who doesn't like endless loops?
    // TODO: Seriously we should change this later
    // Or build a static analyzer to check if we're in an endless loop
    function flattenOutline(
      sections: OutlineSection[],
      levels: string[],
      hideDisabled = false
    ): {
      name: string;
      value: string;
      checked: boolean;
    }[] {
      let counter = 0;
      return sections.flatMap((section, index) => {
        if (hideDisabled && section.disabled) return [];
        counter++;

        const flattened = [
          {
            name: `${"-".repeat(levels.length + 1)} ${counter}. ${
              section.title
            }`,
            value: levels.concat([section.permalink]).join("->"),
            checked: !section.disabled
          }
        ];
        if (section.subsections)
          return flattened.concat(
            flattenOutline(
              section.subsections,
              levels.concat([section.permalink]),
              hideDisabled
            )
          );
        return flattened;
      });
    }

    const outlineFlatList = flattenOutline(
      wizardState.generatedOutline.sections,
      []
    );

    const selectedSections = await checkbox({
      required: true,
      pageSize: 15,
      message: "Pick sections you want to keep: ",
      choices: [...outlineFlatList, new Separator()]
    });

    function setDisabledSections(sections: OutlineSection[], levels: string[]) {
      sections.forEach((section, index) => {
        const levelsStr = levels.concat([section.permalink]).join("->");

        section.disabled = !selectedSections.includes(levelsStr);

        if (section.subsections)
          setDisabledSections(
            section.subsections,
            levels.concat([section.permalink])
          );
      });
    }

    setDisabledSections(wizardState.generatedOutline.sections, []);

    saveState(wizardState);

    const flatListForDisplay = flattenOutline(
      wizardState.generatedOutline.sections,
      [],
      true
    );

    console.log("Selected outline: \n");
    console.log(
      flatListForDisplay.map((section) => section.name).join("\n") + "\n"
    );

    const outlineCopyForImprovements = JSON.parse(
      JSON.stringify(wizardState.generatedOutline)
    );
    outlineCopyForImprovements.sections = deleteDisabledSectionsAndClean(
      outlineCopyForImprovements.sections
    );

    let regenerateOutlineInferenceMessages =
      getOutlineRegenerationInferenceMessages(
        outlineQuestions,
        outlineCopyForImprovements,
        ".".repeat(3000)
      );

    if (!wizardState.outlineComments) wizardState.outlineComments = "";

    const newSections = await input({
      message: `Are there any sections you'd like to add or things to change? (Blank to accept, regneration costs ~${getCallCosts(
        regenerateOutlineInferenceMessages,
        AI_MODELS_INFO[wizardState.smarterModel].outputTokenLimit - 1,
        wizardState.smarterModel
      ).toFixed(4)}): `
    });

    if (newSections.trim()) {
      const tempOutlineComments =
        wizardState.outlineComments + "\n" + newSections;

      saveState(wizardState);

      regenerateOutlineInferenceMessages =
        getOutlineRegenerationInferenceMessages(
          outlineQuestions,
          outlineCopyForImprovements,
          tempOutlineComments
        );

      const newSectionsResponse = await callLLM(
        regenerateOutlineInferenceMessages,
        {
          ...baseOptions,
          saveName: "regenerateOutline",
          jsonType: "start_object",
          maxOutputTokens:
            AI_MODELS_INFO[wizardState.smarterModel].outputTokenLimit - 1,
          continueOnPartialJSON: true
        }
      );

      if (newSectionsResponse.success) {
        wizardState.outlineComments = tempOutlineComments;

        wizardState.generatedOutline = newSectionsResponse.message;

        saveState(wizardState);
      } else {
        if (!confirm({ message: "Couldn't regenerate. Continue anyway?" })) {
          console.log("You can run me again if you'd like!");
          return;
        } else {
          break;
        }
      }
    } else {
      break;
    }
  }

  if (!wizardState.generatedOutline) {
    console.log("No outline generated. Exiting. Run me again perhaps?");
    return;
  }

  wizardState.addDiagrams = await confirm({
    message:
      "Do you want to add diagrams, latex and flowcharts? (This works perfectly 98% of the time): ",
    default: wizardState.addDiagrams || true,
    transformer: (answer) => (answer ? "👍" : "👎")
  });

  function getPageWritingMessages(
    overallOutline: Outline,
    sections: OutlineSection[],
    addDiagrams: boolean
  ): ReadyToGeneratePage[] {
    return sections.flatMap((section) => {
      const sectionsReadyToGenerate: ReadyToGeneratePage = {
        section,
        levels: section.permalink.split(/(?<!\\)\//g).slice(1),
        messages: getPageGenerationInferenceMessages(
          outlineQuestions,
          overallOutline,
          section,
          addDiagrams
        )
      };

      if (section.subsections)
        return [
          sectionsReadyToGenerate,
          ...getPageWritingMessages(
            overallOutline,
            section.subsections,
            addDiagrams
          )
        ];
      else return [sectionsReadyToGenerate];
    });
  }

  const cleanedOutline: Outline = JSON.parse(
    JSON.stringify(wizardState.generatedOutline)
  );

  cleanedOutline.sections = deleteDisabledSectionsAndClean(
    cleanedOutline.sections
  );

  // TODO: I know this is a bad place to put this function
  // but it's like 2 am
  function setPermalinksToRelatives(section: OutlineSection, levels: string[]) {
    section.subsections?.forEach((subsection, i) => {
      setPermalinksToRelatives(subsection, [...levels, section.permalink]);
    });
    section.permalink = `/${[...levels, section.permalink].join("/")}`;
  }

  for (const section of cleanedOutline.sections) {
    setPermalinksToRelatives(section, []);
  }

  console.log("\nCalculating final writing costs...\n");

  const pageWritingMessages = getPageWritingMessages(
    cleanedOutline,
    cleanedOutline.sections,
    wizardState.addDiagrams
  );

  const costs = AI_MODELS_UI.map((model) =>
    pageWritingMessages
      .map((page) => getCallCosts(page.messages, 4096, model.model))
      .reduce((a, b) => a + b, 0)
  );

  wizardState.pageGenerationModel = await select({
    message: `We can finally start writing our ${pageWritingMessages.length} pages! Pick a model to generate content: `,
    choices: [
      ...AI_MODELS_UI.map((model, index) => ({
        name: model.name,
        value: model.model,
        description: `${model.pageDescription} (costs $${costs[index].toFixed(
          4
        )})`
      })),
      new Separator()
    ],
    default:
      wizardState.pageGenerationModel ||
      AI_MODELS_UI[AI_MODELS_UI.length - 1].model
  });

  saveState(wizardState);

  if (
    AI_MODELS_INFO[wizardState.pageGenerationModel].notes &&
    wizardState.pageGenerationModel !== wizardState.smarterModel
  ) {
    console.log(AI_MODELS_INFO[wizardState.pageGenerationModel].notes);
  }

  if (
    AI_MODELS_INFO[wizardState.pageGenerationModel].provider ===
    AI_MODELS_INFO[wizardState.smarterModel].provider
  ) {
    wizardState.pageGenerationApikey = wizardState.smarterApikey;
  } else {
    const pageGenerationModelProvider =
      AI_MODELS_INFO[wizardState.pageGenerationModel]?.provider;

    if (!pageGenerationModelProvider) {
      console.log(
        "Couldn't find the provider for the model you selected. Please run again?"
      );
      process.exit(1);
    }

    const cheapestPageGenerationProviderModel = Object.entries(AI_MODELS_INFO)
      .filter(([model, info]) => info.provider === pageGenerationModelProvider)
      .sort((a, b) => a[1].outputTokensPerM - b[1].outputTokensPerM)[0];

    // Ask for next key
    wizardState.pageGenerationApikey =
      (await password({
        message:
          "It looks like you want to use a different provider! We'll need a new API key for that:.\n (You can leave this blank if it's already in the ENV variable.): ",
        mask: "*",
        validate: async (key) => {
          const testResponse = await callLLM(
            [{ role: "user", content: "What is your name?" }],
            {
              model: cheapestPageGenerationProviderModel[0],
              maxOutputTokens: 10,
              apiKey: key || undefined
            }
          );

          if (testResponse.success) return true;

          if (key.trim()) return `Your key didn't work. Try again?`;
          else return `The key in your env didn't work. Try again?`;
        }
      })) || undefined;
  }
  saveState(wizardState);

  if (!wizardState.preferredRunnerForNextra) {
    wizardState.preferredRunnerForNextra = await select({
      message:
        "Seems we haven't set up the scaffold yet. Which runner do you prefer? Bun would be fastest if you have it.",
      choices: RUNNERS.filter((editor) =>
        isCommandAvailable(editor.command)
      ).map((editor) => ({
        name: editor.name,
        value: editor.command
      })),
      default: "npm"
    });
  }

  if (!wizardState.preferredRunnerForNextra) {
    console.log(
      "No runner selected - Exiting. Run me again after installing something. You can install bun with `curl -fsSL https://bun.sh/install | bash`"
    );
    return;
  }

  saveState(wizardState);

  const docsFolder = process.cwd();

  wizardState.overwritePages =
    (fs.existsSync(path.join(docsFolder, "pages")) &&
      (await confirm({
        message:
          "There seem to already be a pages folder. Should we overwrite? ",
        default: wizardState.overwritePages || false,
        transformer: (answer) => (answer ? "👍" : "👎")
      }))) ||
    false;

  saveState(wizardState);

  if (!fs.existsSync(path.join(docsFolder, "pages"))) {
    idempotentlySetupNextraDocs(
      docsFolder,
      // biome-ignore lint/style/noNonNullAssertion: TS can't detect it but due to current code path we know this won't be null
      RUNNERS.find(
        (runner) => runner.command === wizardState.preferredRunnerForNextra
      )!,
      wizardState
    );
  }

  const parallelPagesToGenerate = await select({
    message:
      "\n\n##############\n\nReady to start. How many pages do you want to generate simultaneously?",
    choices: [
      {
        name: "1",
        value: 1,
        description:
          "Safest - we'll go one page at a time. Only one suitable for Claude at the moment."
      },
      {
        name: "2",
        value: 2,
        description: "A little faster"
      },
      {
        name: "5",
        value: 5,
        description: "Whoa there"
      },
      {
        name: "All",
        value: 0,
        description: "Use at your own risk - bloody fast!"
      }
    ]
  });

  console.log(
    "\n\nAnd we're off! If this helps do find https://github.com/hrishioa/lumentis and drop a star!\n\n"
  );

  await generatePages(
    true,
    pageWritingMessages,
    path.join(docsFolder, "pages"),
    wizardState,
    parallelPagesToGenerate
  );
}

runWizard();
