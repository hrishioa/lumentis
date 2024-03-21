#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  Separator,
  checkbox,
  confirm,
  editor,
  input,
  password,
  select
} from "@inquirer/prompts";
import { getClaudeCosts, runClaudeInference } from "./ai";
import {
  CLAUDE_MODELS,
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
import { OutlineSection, ReadyToGeneratePage, WizardState } from "./types";
import { isCommandAvailable } from "./utils";

async function runWizard() {
  function saveState(state: WizardState) {
    if (!fs.existsSync(lumentisFolderPath)) fs.mkdirSync(lumentisFolderPath);
    fs.writeFileSync(wizardStatePath, JSON.stringify(state, null, 2));
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

  wizardState.smarterModel = await select({
    message:
      "Pick a model for meta inference.\n Smarter is preferred, you can use a cheaper model for the actual writing later.",
    choices: [
      ...CLAUDE_MODELS.map((model) => ({
        name: model.name,
        value: model.model,
        description: model.smarterDescription
      })),
      new Separator()
    ],
    default: wizardState.smarterModel || CLAUDE_MODELS[0].model
  });

  saveState(wizardState);

  wizardState.streamToConsole = await confirm({
    message:
      "Do you want to stream outputs to console? \n Looks awesome but clutters things up:",
    default: wizardState.streamToConsole || false,
    transformer: (answer) => (answer ? "👍" : "👎")
  });

  saveState(wizardState);

  const fileName = await input({
    message:
      "What's your primary source? \n Drag a text file in here, or leave empty/whitespace to open an editor: ",
    default: wizardState.primarySourceFilename || undefined,
    validate: (filename) => {
      if (
        filename?.trim() &&
        !fs.existsSync(
          path.normalize(
            filename
              .replace(/^["'](.*)["']$/, "$1")
              .replace(/\\/, "")
              .trim()
          )
        )
      )
        return `File not found - tried to load ${filename}. Try again.`;
      return true;
    }
  });

  if (fileName.trim()) {
    wizardState.primarySourceFilename = path.normalize(
      fileName
        .replace(/^["'](.*)["']$/, "$1")
        .replace(/\\/, "")
        .trim()
    );

    const dataFromFile = fs.readFileSync(
      wizardState.primarySourceFilename,
      "utf-8"
    );

    wizardState.loadedPrimarySource = dataFromFile;
  } else {
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
      }
    });

    wizardState.loadedPrimarySource = dataFromEditor;
  }

  saveState(wizardState);

  wizardState.anthropicKey =
    (await password({
      message:
        "Please enter an Anthropic API key.\n (You can leave this blank if it's already in the ENV variable.): ",
      mask: "*",
      validate: async (key) => {
        const testResponse = await runClaudeInference(
          [{ role: "user", content: "What is your name?" }],
          CLAUDE_MODELS[CLAUDE_MODELS.length - 1].model,
          10,
          key || undefined
        );

        if (testResponse.success) return true;

        if (key.trim()) return `Your key didn't work. Try again?`;
        else return `The key in your env didn't work. Try again?`;
      }
    })) || undefined;

  const descriptionInferenceMessages = getDescriptionInferenceMessages(
    wizardState.loadedPrimarySource
  );

  const description = await input({
    message: `Do you have a short description of your source?\n Who's talking, what type of content is it etc.\n (Leave empty to generate - costs $${getClaudeCosts(
      descriptionInferenceMessages,
      700,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default: wizardState.description || undefined
  });

  if (description.trim()) {
    wizardState.description = description;
  } else {
    const generatedDescription = await runClaudeInference(
      descriptionInferenceMessages,
      wizardState.smarterModel,
      700,
      wizardState.anthropicKey,
      wizardState.streamToConsole,
      "description"
    );

    if (generatedDescription.success) {
      console.log(
        `Generated description \n(edit this in ${wizardStatePath} if you need to and restart!): ${generatedDescription.response}\n\n`
      );

      wizardState.description = generatedDescription.response;
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

  const title = await input({
    message: `Do you have a short title or name?\n (Leave empty to generate - costs $${getClaudeCosts(
      titleInferenceMessages,
      400,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default: wizardState.title || undefined
  });

  if (title.trim()) {
    wizardState.title = title;
  } else {
    const titleOptionsResponse = await runClaudeInference(
      titleInferenceMessages,
      wizardState.smarterModel,
      800,
      wizardState.anthropicKey,
      wizardState.streamToConsole,
      "title",
      "started_array"
    );

    if (titleOptionsResponse.success) {
      const selectedAnswer: string = await select({
        message: "Pick your favorite or enter a new one: ",
        choices: titleOptionsResponse.response
          .map((title: string) => ({
            name: title,
            value: title
          }))
          .concat([
            new Separator(),
            { name: "Enter a new one", value: "__new__" },
            new Separator()
          ])
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

  const themesInferenceMessages = getThemeInferenceMessages(
    wizardState.loadedPrimarySource
  );

  const themesFromUser = await input({
    message: `Do you have any core themes or keywords about the source or the intended audience?\n (Leave empty to generate - costs $${getClaudeCosts(
      themesInferenceMessages,
      400,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default: wizardState.coreThemes || undefined
  });

  if (themesFromUser.trim()) {
    wizardState.coreThemes = themesFromUser.trim();
  } else {
    const themesOptionsResponse = await runClaudeInference(
      themesInferenceMessages,
      wizardState.smarterModel,
      800,
      wizardState.anthropicKey,
      wizardState.streamToConsole,
      "themes",
      "started_array"
    );

    if (themesOptionsResponse.success) {
      const selectedThemes = await checkbox({
        message: "Deselect any you don't want: ",
        choices: themesOptionsResponse.response.map((theme: string) => ({
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

  const audienceInferenceMessages = getAudienceInferenceMessages(
    wizardState.loadedPrimarySource,
    wizardState.description
  );

  const audienceFromUser = await input({
    message: `Do you have any intended audience in mind?\n (Leave empty to generate - costs $${getClaudeCosts(
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
    const audienceOptionsResponse = await runClaudeInference(
      audienceInferenceMessages,
      wizardState.smarterModel,
      800,
      wizardState.anthropicKey,
      wizardState.streamToConsole,
      "audience",
      "started_array"
    );

    if (audienceOptionsResponse.success) {
      const selectedAudience: string[] = await checkbox({
        message: "Deselect any you don't want: ",
        choices: audienceOptionsResponse.response.map((audience: string) => ({
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

  const questionsMessages = getQuestionsInferenceMessages(
    wizardState.loadedPrimarySource,
    wizardState.description,
    wizardState.ambiguityExplained
  );

  const questionPermission = await confirm({
    message: `Are you okay ${
      wizardState.ambiguityExplained ? "re" : ""
    }answering some questions about things that might not be well explained in the primary source?\n (Costs ${getClaudeCosts(
      questionsMessages,
      2048,
      wizardState.smarterModel
    ).toFixed(4)}): `,
    default: false,
    transformer: (answer) => (answer ? "👍" : "👎")
  });

  if (questionPermission) {
    const questionsResponse = await runClaudeInference(
      questionsMessages,
      wizardState.smarterModel,
      2048,
      wizardState.anthropicKey,
      wizardState.streamToConsole,
      "questions",
      "started_array"
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
        default: `Here are some questions: \n${questionsResponse.response
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

  const writingExampleFilename = await input({
    message:
      "Do you have an example of writing style you want to add in (adds cost but improves output, \nleave blank to skip. Drag in a file): ",
    default: wizardState.writingExampleFilename || undefined,
    validate: (filename) => {
      if (
        filename?.trim() &&
        !fs.existsSync(
          path.normalize(
            filename
              .replace(/^["'](.*)["']$/, "$1")
              .replace(/\\/, "")
              .trim()
          )
        )
      )
        return `File not found - tried to load ${filename}. Try again.`;
      return true;
    }
  });

  if (writingExampleFilename.trim()) {
    wizardState.writingExampleFilename = writingExampleFilename
      .replace(/^["'](.*)["']$/, "$1")
      .replace(/\\/, "")
      .trim();

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
      message: `We're about to generate the outline (Costs $${getClaudeCosts(
        outlineQuestions,
        4096,
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

    const outlineResponse = await runClaudeInference(
      outlineQuestions,
      wizardState.smarterModel,
      4096,
      wizardState.anthropicKey,
      wizardState.streamToConsole,
      "outline",
      "started_object"
    );

    if (outlineResponse.success) {
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
      message: `Are there any sections you'd like to add or things to change? (Blank to accept, regneration costs ~${getClaudeCosts(
        regenerateOutlineInferenceMessages,
        4096,
        wizardState.smarterModel
      ).toFixed(4)}): `
    });

    if (newSections.trim()) {
      wizardState.outlineComments += "\n" + newSections;

      saveState(wizardState);

      regenerateOutlineInferenceMessages =
        getOutlineRegenerationInferenceMessages(
          outlineQuestions,
          outlineCopyForImprovements,
          wizardState.outlineComments
        );

      const newSectionsResponse = await runClaudeInference(
        regenerateOutlineInferenceMessages,
        wizardState.smarterModel,
        4096,
        wizardState.anthropicKey,
        wizardState.streamToConsole,
        "regenerateOutline",
        "started_object"
      );

      if (newSectionsResponse.success) {
        wizardState.generatedOutline = newSectionsResponse.response;

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

  wizardState.skipDiagrams = await confirm({
    message: "Do you want to skip diagrams? (Recommended for now): ",
    default: wizardState.skipDiagrams || true,
    transformer: (answer) => (answer ? "👍" : "👎")
  });

  function getPageWritingMessages(
    sections: OutlineSection[],
    levels: string[],
    skipDiagrams: boolean
  ): ReadyToGeneratePage[] {
    return sections.flatMap((section) => {
      const sectionMessages = {
        section,
        levels: levels.concat([section.permalink]),
        messages: getPageGenerationInferenceMessages(
          outlineQuestions,
          // biome-ignore lint/style/noNonNullAssertion: TS can't detect it but due to current code path we know this won't be null
          wizardState.generatedOutline!,
          section,
          skipDiagrams
        )
      };

      if (section.subsections)
        return [
          sectionMessages,
          ...getPageWritingMessages(
            section.subsections,
            levels.concat([section.permalink]),
            skipDiagrams
          )
        ];
      else return [sectionMessages];
    });
  }

  const cleanedOutline = JSON.parse(
    JSON.stringify(wizardState.generatedOutline)
  );

  cleanedOutline.sections = deleteDisabledSectionsAndClean(
    cleanedOutline.sections
  );

  console.log("\nCalculating final writing costs...\n");

  const pageWritingMessages = getPageWritingMessages(
    cleanedOutline.sections,
    [],
    wizardState.skipDiagrams
  );

  const costs = CLAUDE_MODELS.map((model) =>
    pageWritingMessages
      .map((page) => getClaudeCosts(page.messages, 4096, model.model))
      .reduce((a, b) => a + b, 0)
  );

  wizardState.pageGenerationModel = await select({
    message: `We can finally start writing our ${pageWritingMessages.length} pages! Pick a model to generate content: `,
    choices: [
      ...CLAUDE_MODELS.map((model, index) => ({
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
      CLAUDE_MODELS[CLAUDE_MODELS.length - 1].model
  });

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

  const finalCheck = await confirm({
    message: "#######\n\nReady to start? ",
    default: true,
    transformer: (answer) => (answer ? "👍" : "👎")
  });

  if (!finalCheck) {
    console.log("No problem! You know where to find me.");
    return;
  }

  console.log(
    "\n\nAnd we're off! If this helps do find https://hrishioa/lumentis and drop a star!\n\n"
  );

  await generatePages(
    true,
    pageWritingMessages,
    path.join(docsFolder, "pages"),
    wizardState
  );
}

runWizard();
