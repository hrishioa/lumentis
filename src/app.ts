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

import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import { join } from 'path';
import { select } from "@inquirer/prompts";

async function setupI18n() {
  await i18next
    .use(Backend)
    .init({
      fallbackLng: 'en',
      backend: {
        loadPath: join(__dirname, 'locales/{{lng}}/{{ns}}.json'),
      },
    });

  if (i18next.isInitialized) {
    console.log('i18next has been initialized successfully');
  } else {
    console.error('i18next failed to initialize');
  }
}

await setupI18n();

const t = i18next.t.bind(i18next);

async function runWizard() {
  // Language selection
  const languageChoice = await select({
    message: "Choose your preferred language / 선호하는 언어를 선택하세요",
    choices: [
      { name: "English", value: "en" },
      { name: "한국어", value: "ko" }
    ],
  });

  // Change the language based on user's choice
  await i18next.changeLanguage(languageChoice);

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

  console.log(t('welcome'));
  console.log(t('configFiles', { folder: LUMENTIS_FOLDER }));
  console.log(t('repeatSteps'));

  if (!wizardState.gotDirectoryPermission) {
    wizardState.gotDirectoryPermission = await confirm({
      message: t('directoryPermission'),
      default: true,
      transformer: (answer) => (answer ? "👍" : "👎")
    });

    if (!wizardState.gotDirectoryPermission) {
      console.log(t('noProblemRestart'));
      return;
    }
  }

  saveState(wizardState);

  wizardState.smarterModel = await select({
    message: t('selectModel'),
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

  wizardState.streamToConsole = await confirm({
    message: t('streamToConsole'),
    default: wizardState.streamToConsole || false,
    transformer: (answer) => (answer ? "👍" : "👎")
  });

  saveState(wizardState);

  const fileName = await input({
    message: t('uploadFile'),
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
            return t('youtubeError', { filename, error: err });
          }
        } else if (!fs.existsSync(parsePlatformIndependentPath(filename))) {
          return t('fileNotFound', { filename });
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
            return t('fileReadError', { filename });
          }
        }
      }
      return true;
    }
  });

  saveState(wizardState);

  if (!wizardState.loadedPrimarySource) {
    const editorName = await select({
      message: t('selectEditor'),
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
      message: t('openEditor', { editorName }),
      validate: (input) => {
        if (!input.trim()) return t('enterContent');
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
      message: t('contentTooLarge', { tokens: primarySourceTokens - PRIMARYSOURCE_BUDGET }),
      default: wizardState.ignorePrimarySourceSize || false,
      transformer: (answer) => (answer ? "👍" : "👎")
    });

    if (!wizardState.ignorePrimarySourceSize) {
      console.log(t('adjustSource'));
      return;
    }
  }

  const smarterModelProvider =
    AI_MODELS_INFO[wizardState.smarterModel]?.provider;

  if (!smarterModelProvider) {
    console.log(t('providerNotFound'));
    process.exit(1);
  }

  const cheapestSmartProviderModel = Object.entries(AI_MODELS_INFO)
    .filter(([model, info]) => info.provider === smarterModelProvider)
    .sort((a, b) => a[1].outputTokensPerM - b[1].outputTokensPerM)[0];

  wizardState.smarterApikey =
    (await password({
      message: t('enterApiKey', { provider: smarterModelProvider.toUpperCase() }),
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

        if (key.trim()) return t('apiKeyError');
        else return t('envKeyError');
      }
    })) || undefined;

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
    message: t('sourceDescription', {
      cost: getCallCosts(descriptionInferenceMessages, 700, wizardState.smarterModel).toFixed(4)
    }),
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
      console.log(t('generatedDescription', {
        path: wizardStatePath,
        description: generatedDescription.message
      }));

      wizardState.description = generatedDescription.message;
    } else {
      wizardState.description = await input({
        message: t('typeDescription'),
        default: wizardState.description,
        validate: (input) => !!input.trim() || t('enterDescription')
      });
    }
  }

  saveState(wizardState);

  if (!wizardState.description?.trim())
    throw new Error(t('noDescription'));

  const titleInferenceMessages = getTitleInferenceMessages(
    wizardState.loadedPrimarySource,
    wizardState.description
  );

  const title = await input({
    message: t('shortTitle', {
      cost: getCallCosts(titleInferenceMessages, 400, wizardState.smarterModel).toFixed(4)
    }),
    default: wizardState.title || undefined
  });

  if (title.trim()) {
    wizardState.title = title;
  } else {
    const titleOptionsResponse = await callLLM(titleInferenceMessages, {
      ...baseOptions,
      saveName: "title",
      jsonType: "start_array"
    });

    if (titleOptionsResponse.success) {
      const titleOptions: string[] = titleOptionsResponse.message;
      const selectedAnswer: string = await select({
        message: t('pickTitle'),
        choices: [
          ...titleOptions.map((title: string) => ({
            name: title,
            value: title
          })),
          ...[
            new Separator(),
            { name: t('newTitle'), value: "__new__" },
            new Separator()
          ]
        ]
      });

      wizardState.title =
        selectedAnswer === "__new__"
          ? await input({ message: t('enterNewTitle') })
          : selectedAnswer;
    } else {
      wizardState.title = await input({
        message: t('typeDescription'),
        default: wizardState.title,
        validate: (input) => !!input.trim() || t('enterNewTitle')
      });
    }
  }

  saveState(wizardState);

  // Ask for favicon URL
    
    const urlPattern =
      /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    wizardState.faviconUrl = await input({
      message: t('chooseFavicon'),
      default:
        wizardState.faviconUrl ||
        "https://raw.githubusercontent.com/HebeHH/lumentis/choose-favicon/assets/default-favicon.png",
      validate: (favicon_url) => {
        if (!urlPattern.test(favicon_url.trim())) {
          return t('invalidUrl', { url: favicon_url.trim() });
        }
        return true;
      }
    });

    saveState(wizardState);

    const themesInferenceMessages = getThemeInferenceMessages(
      wizardState.loadedPrimarySource
    );

    const themesFromUser = await input({
      message: t('coreThemes', {
        cost: getCallCosts(themesInferenceMessages, 400, wizardState.smarterModel).toFixed(4)
      }),
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
          message: t('deselectThemes'),
          choices: themesOptionsResponse.message.map((theme: string) => ({
            name: theme,
            value: theme,
            checked: true
          }))
        });

        const newThemesFromUser = await input({
          message: t('addMoreThemes')
        });

        wizardState.coreThemes = (
          selectedThemes.join(", ") +
          " " +
          newThemesFromUser
        ).trim();
      } else {
        wizardState.coreThemes = await input({
          message: t('typeDescription'),
          default: wizardState.coreThemes,
          validate: (input) => !!input.trim() || t('enterTheme')
        });
      }
    }

    saveState(wizardState);

    const audienceInferenceMessages = getAudienceInferenceMessages(
      wizardState.loadedPrimarySource,
      wizardState.description
    );

    const audienceFromUser = await input({
      message: t('intendedAudience', {
        cost: getCallCosts(audienceInferenceMessages, 400, wizardState.smarterModel).toFixed(4)
      }),
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
          message: t('deselectThemes'),
          choices: audienceOptionsResponse.message.map((audience: string) => ({
            name: audience,
            value: audience,
            checked: true
          }))
        });

        const newAudienceFromUser = await input({
          message: t('addMoreThemes')
        });

        wizardState.intendedAudience = (
          selectedAudience.join(", ") +
          " " +
          newAudienceFromUser
        ).trim();
      } else {
        wizardState.intendedAudience = await input({
          message: t('typeDescription'),
          default: wizardState.intendedAudience,
          validate: (input) => !!input.trim() || t('describeAudience')
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
      message: t('answerQuestions', {
        re: wizardState.ambiguityExplained ? t('re') : '',
        cost: getCallCosts(questionsMessages, 2048, wizardState.smarterModel).toFixed(4)
      }),
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
        }
      );

      if (questionsResponse.success) {
        if (!wizardState.preferredEditor) {
          const editorName = await select({
            message: t('selectEditor'),
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
          message: t('openingEditor', { editor: process.env.EDITOR }),
          waitForUseInput: false,
          default: t('someQuestions') + questionsResponse.message
            .map(
              (question: string, index: number) =>
                `${index + 1}. ${question}\n\n${t('answer')}: \n\n`
            )
            .join("\n")
        });

        wizardState.ambiguityExplained =
          (wizardState.ambiguityExplained || "") + dataFromEditor;
      } else {
        console.log(t('skipGeneration'));
      }
    }

    saveState(wizardState);

    const writingExampleFilename = await input({
      message: t('writingStyle'),
      default: wizardState.writingExampleFilename || undefined,
      validate: (filename) => {
        if (
          filename?.trim() &&
          !fs.existsSync(parsePlatformIndependentPath(filename))
        )
          return t('fileNotFound', { filename });
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
        message: t('generateOutline', {
          cost: getCallCosts(
            outlineQuestions,
            AI_MODELS_INFO[wizardState.smarterModel].outputTokenLimit - 1,
            wizardState.smarterModel
          ).toFixed(4)
        }),
        default: true,
        transformer: (answer) => (answer ? "👍" : "👎")
      });

      if (!confirmOutline) {
        console.log(t('generateLater'));
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
        wizardState.generatedOutline = outlineResponse.message;
      } else {
        console.log(t('outlineError'));
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
        console.log(t('noOutline'));
        return;
      }

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
        message: t('pickSections'),
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

      console.log(t('selectedOutline'));
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
        message: t('addSections', {
          cost: getCallCosts(
            regenerateOutlineInferenceMessages,
            AI_MODELS_INFO[wizardState.smarterModel].outputTokenLimit - 1,
            wizardState.smarterModel
          ).toFixed(4)
        })
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
          if (!confirm({ message: t('regenerateError') })) {
            console.log(t('runAgain'));
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
      console.log(t('noOutline'));
      return;
    }

    wizardState.addDiagrams = await confirm({
      message: t('addDiagrams'),
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

    console.log(t('calculatingCosts'));

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
      message: t('startWriting', { pages: pageWritingMessages.length }),
      choices: [
        ...AI_MODELS_UI.map((model, index) => ({
          name: model.name,
          value: model.model,
          description: `${model.pageDescription} (${t('costs')} $${costs[index].toFixed(4)})`
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
        console.log(t('providerNotFound'));
        process.exit(1);
      }

      const cheapestPageGenerationProviderModel = Object.entries(AI_MODELS_INFO)
        .filter(([model, info]) => info.provider === pageGenerationModelProvider)
        .sort((a, b) => a[1].outputTokensPerM - b[1].outputTokensPerM)[0];

      wizardState.pageGenerationApikey =
        (await password({
          message: t('differentProvider'),
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

            if (key.trim()) return t('apiKeyError');
            else return t('envKeyError');
          }
        })) || undefined;
    }
    saveState(wizardState);

    if (!wizardState.preferredRunnerForNextra) {
      wizardState.preferredRunnerForNextra = await select({
        message: t('selectRunner'),
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
      console.log(t('noRunnerSelected'));
      return;
    }

    saveState(wizardState);

    const docsFolder = process.cwd();

    wizardState.overwritePages =
      (fs.existsSync(path.join(docsFolder, "pages")) &&
        (await confirm({
          message: t('overwritePages'),
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
      message: t('readyToStart'),
      choices: [
        {
          name: "1",
          value: 1,
          description: t('safestOption')
        },
        {
          name: "2",
          value: 2,
          description: t('fasterOption')
        },
        {
          name: "5",
          value: 5,
          description: t('fastestOption')
        },
        {
          name: t('all'),
          value: 0,
          description: t('riskiestOption')
        }
      ]
    });

    console.log(t('startingMessage'));

    await generatePages(
      true,
      pageWritingMessages,
      path.join(docsFolder, "pages"),
      wizardState,
      parallelPagesToGenerate
    );
  }

  runWizard();
