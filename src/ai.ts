import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { TiktokenModel, encoding_for_model } from "tiktoken";

import { MessageParam } from "@anthropic-ai/sdk/resources";
import { countTokens } from "@anthropic-ai/tokenizer";
import {
  AI_MODELS_INFO,
  MESSAGES_FOLDER,
  lumentisFolderPath
} from "./constants";
import {
  getOutlineInferenceMessages,
  getPageGenerationInferenceMessages
} from "./prompts";
import {
  AICallFailure,
  AICallResponse,
  AICallSuccess,
  AICallerOptions,
  GenericMessageParam,
  Outline
} from "./types";
import { partialParse } from "./utils";

const AI_PROVIDERS = {
  anthropic: {
    name: "Anthropic",
    caller: callAnthropic,
    costCounter: getClaudeCostsFromText
  },
  openai: {
    name: "OpenAI",
    caller: callOpenAI,
    costCounter: getOpenAICostsFromText
  }
};

async function callAnthropic(
  messages: GenericMessageParam[],
  options: AICallerOptions
): Promise<AICallResponse> {
  const {
    maxOutputTokens,
    apiKey,
    streamToConsole,
    saveToFilepath,
    prefix,
    jsonType,
    systemPrompt,
    model
  } = options;
  console.log("Calling Anthropic");

  if (jsonType === "start_object") {
    messages.push({
      role: "assistant",
      content: "{"
    });
  } else if (jsonType === "start_array") {
    messages.push({
      role: "assistant",
      content: "["
    });
  }

  let outputTokens = 0;
  let inputTokens = 0;
  let fullMessage = "";
  let diffToFlush = 0;

  const anthropic = apiKey ? new Anthropic({ apiKey }) : new Anthropic();

  const response = await anthropic.messages.create({
    messages: messages as MessageParam[],
    model,
    system: systemPrompt ? systemPrompt : "",
    max_tokens: maxOutputTokens,
    stream: true
  });

  if (streamToConsole)
    process.stdout.write(
      `\n\nStreaming from ${model}${
        saveToFilepath ? ` to ${saveToFilepath}` : ""
      }: `
    );

  for await (const chunk of response) {
    const chunkText =
      (chunk.type === "content_block_start" && chunk.content_block.text) ||
      (chunk.type === "content_block_delta" && chunk.delta.text) ||
      "";
    if (chunk.type === "message_start")
      inputTokens += chunk.message.usage.input_tokens;

    if (chunk.type === "message_delta")
      outputTokens += chunk.usage.output_tokens;

    if (streamToConsole) process.stdout.write(chunkText);

    fullMessage += chunkText;

    if (saveToFilepath) {
      diffToFlush += chunkText.length;

      if (diffToFlush > 5000) {
        diffToFlush = 0;
        fs.writeFileSync(saveToFilepath, (prefix || "") + fullMessage);
      }
    }
  }

  if (jsonType === "start_object") fullMessage = "{" + fullMessage;
  else if (jsonType === "start_array") fullMessage = "[" + fullMessage;
  if (jsonType === "start_object" || jsonType === "start_array")
    fullMessage = fullMessage.split("```")[0];
  if (jsonType === "parse") {
    const matchedJSON = fullMessage.match(/```json([\s\S]*?)```/g);
    if (matchedJSON) {
      fullMessage = matchedJSON[0]
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
    }
  }

  return {
    fullMessage,
    outputTokens,
    inputTokens
  };
}

// this function handles the two common ways I've seen OpenAI return JSON
function extractArrayFromOpenAIResponse(response: string): string {
  const respDict = JSON.parse(response);
  const respKeys = Object.keys(respDict);
  if (respKeys.length === 1) {
    return JSON.stringify(respDict[respKeys[0]]);
  } else {
    const arr = respKeys.map((key) => respDict[key]);
    return JSON.stringify(arr);
  }
}

// TODO:
// * Implement streaming. Doesn't look like OpenAI includes token usage in stream response object though, so that becomes complicated.
// * `json_mode` doesn't really support continuance since it always returns proper JSON objects. Need to figure out how to handle that - json mode doesn't guarantee that it will actually finish the JSON object.
async function callOpenAI(
  messages: GenericMessageParam[],
  options: AICallerOptions
): Promise<AICallResponse> {
  const {
    model,
    maxOutputTokens,
    streamToConsole,
    saveToFilepath,
    apiKey,
    prefix,
    systemPrompt,
    jsonType
  } = options;
  console.log("Calling OpenAI");

  const arrayWrapperPromptAddition =
    jsonType === "start_array"
      ? "\n\nPlease wrap the returned array in a JSON object with a key of 'results' to ensure proper parsing. Eg: structure the returned object as `{ \"results\": [ ... ]}`"
      : "";

  if (systemPrompt || jsonType === "start_array") {
    messages.unshift({
      role: "system",
      content: systemPrompt + arrayWrapperPromptAddition
    });
  }

  const openai = apiKey ? new OpenAI({ apiKey }) : new OpenAI();

  const completion = await openai.chat.completions.create({
    messages,
    model,
    stream: true,
    max_tokens: maxOutputTokens,
    response_format: jsonType ? { type: "json_object" } : undefined
  });

  if (streamToConsole) {
    process.stdout.write(
      `\n\nStreaming from ${model}${
        saveToFilepath ? ` to ${saveToFilepath}` : ""
      }: `
    );
  }

  let fullMessage = "";
  let diffToFlush = 0;

  let promptTokens = 0;
  let completionTokens = 0;

  for await (const chunk of completion) {
    promptTokens += chunk.usage?.prompt_tokens || 0;
    completionTokens += chunk.usage?.completion_tokens || 0;
    const chunkText =
      chunk.choices?.map((choice) => choice.delta.content).join("") || "";

    if (!chunkText) continue;

    fullMessage += chunkText;

    if (streamToConsole) {
      process.stdout.write(chunkText);
    }

    if (saveToFilepath) {
      diffToFlush += chunkText.length;

      if (diffToFlush > 5000) {
        diffToFlush = 0;
        fs.writeFileSync(saveToFilepath, (prefix || "") + fullMessage);
      }
    }
  }

  if (jsonType === "start_array") {
    fullMessage = extractArrayFromOpenAIResponse(fullMessage);

    if (saveToFilepath)
      fs.writeFileSync(saveToFilepath, (prefix || "") + fullMessage);
  }

  return {
    fullMessage,
    outputTokens: completionTokens,
    inputTokens: promptTokens
  };
}

// hebe's note: should we call this caLLM for fun?
// editor's note: no it's too on the nose
export async function callLLM(
  messages: GenericMessageParam[],
  options: AICallerOptions
): Promise<AICallSuccess | AICallFailure> {
  const {
    model,
    apiKey,
    streamToConsole = false, // Set default values here
    saveName,
    jsonType,
    saveToFilepath,
    prefix,
    systemPrompt,
    continueOnPartialJSON
  } = options;
  const provider = AI_MODELS_INFO[model].provider;
  const maxOutputTokens = Math.min(
    AI_MODELS_INFO[model].outputTokenLimit,
    options.maxOutputTokens
  );

  if (AI_PROVIDERS[provider] === undefined) {
    throw new Error("Invalid provider");
  }

  const messageBackupSpot = path.join(lumentisFolderPath, MESSAGES_FOLDER);

  if (saveName) {
    if (!fs.existsSync(messageBackupSpot)) fs.mkdirSync(messageBackupSpot);
    fs.writeFileSync(
      path.join(messageBackupSpot, saveName + ".json"),
      JSON.stringify(messages, null, 2)
    );
  }

  // remove trailing whitespace from last message
  if (
    messages[messages.length - 1] &&
    messages[messages.length - 1].role === "assistant"
  ) {
    messages[messages.length - 1].content = (
      messages[messages.length - 1].content as string
    ).trimEnd();
  }

  try {
    let fullMessage = "";
    let outputTokens = 0;
    let inputTokens = 0;
    if (AI_PROVIDERS[provider].caller === undefined) {
      throw new Error("Invalid provider");
    } else {
      const aiResponse = await AI_PROVIDERS[provider].caller(messages, options);
      fullMessage = aiResponse.fullMessage;
      outputTokens = aiResponse.outputTokens;
      inputTokens = aiResponse.inputTokens;
    }

    if (streamToConsole) process.stdout.write("\n\n");

    if (jsonType) {
      let potentialPartialJSON = fullMessage;

      do {
        // TODO: This is a bit of a mess because we're trying to maintain top-down flow
        // and for upcoming migration to OpenAI, rewrite later if it's too ugly
        try {
          const parsedJSON = JSON.parse(potentialPartialJSON);
          fullMessage = JSON.stringify(parsedJSON, null, 2);

          break;
        } catch (err) {
          const partialJSON = partialParse(potentialPartialJSON);

          fullMessage = JSON.stringify(partialJSON, null, 2);

          if (!continueOnPartialJSON) {
            break;
          }
        }

        const newMessages = [
          ...(messages[messages.length - 1].role === "assistant"
            ? JSON.parse(JSON.stringify(messages)).slice(0, -1)
            : JSON.parse(JSON.stringify(messages))),
          {
            role: "assistant",
            content: potentialPartialJSON
          }
        ];

        try {
          const continuance = await callLLM(newMessages, {
            model,
            maxOutputTokens,
            apiKey,
            streamToConsole,
            saveName,
            continueOnPartialJSON: false
          });

          if (continuance.success === false) {
            const sortOfPartialJSON = partialParse(potentialPartialJSON);
            fullMessage = JSON.stringify(sortOfPartialJSON, null, 2);
          } else {
            fullMessage += continuance.message; // Not entirely sure about this one but I think it's needed?
            outputTokens += continuance.outputTokens;
            inputTokens += continuance.inputTokens || 0;
            potentialPartialJSON += continuance.message;
          }
        } catch (err) {
          console.error("Breaking because of error - ", err);
          break;
        }
      } while (continueOnPartialJSON);
    }

    if (saveName) {
      if (!fs.existsSync(messageBackupSpot)) fs.mkdirSync(messageBackupSpot);
      fs.writeFileSync(
        path.join(messageBackupSpot, saveName + "_response" + ".txt"),
        fullMessage
      );
    }

    if (saveToFilepath) {
      fs.writeFileSync(saveToFilepath, (prefix || "") + fullMessage);
    }

    // TODO: Add cost calculation
    // const totalCost = getCallCostsWithTokens(inputTokens, outputTokens, provider, model)

    // const cost = {
    //   total: totalCost,
    //   input: getCallCostsWithTokens(inputTokens, 0, provider, model),
    //   output: getCallCostsWithTokens(0, outputTokens, provider, model)
    // }

    return {
      success: true,
      outputTokens,
      inputTokens,
      // cost,
      message: jsonType ? JSON.parse(fullMessage) : fullMessage
    };
  } catch (err) {
    const errText = (err as Error).toString();
    console.error(err);

    if (
      errText.toLowerCase().includes("rate limit") ||
      errText.toLowerCase().includes("ratelimit")
    ) {
      return {
        success: false,
        rateLimited: true,
        error: errText
      };
    }
    return {
      success: false,
      rateLimited: false,
      error: errText
    };
  }
}

export function getCallCosts(
  messages: GenericMessageParam[],
  outputTokensExpected: number,
  model: string
) {
  const provider = AI_MODELS_INFO[model].provider;
  const inputText: string = messages.map((m) => m.content).join("\n");

  return AI_PROVIDERS[provider].costCounter(
    inputText,
    outputTokensExpected,
    model
  );
}

function getClaudeCostsFromText(
  inputPrompt: string,
  outputTokensExpected: number,
  model: string
) {
  const inputTokens = countTokens(inputPrompt);

  return getProviderCostsWithTokens(inputTokens, outputTokensExpected, model);
}

function getOpenAICostsFromText(
  inputPrompt: string,
  outputTokensExpected: number,
  model: string
) {
  const tiktokenModel = AI_MODELS_INFO[model]
    .tokenCountingModel as TiktokenModel;
  const enc = encoding_for_model(tiktokenModel);
  const inputTokens = enc.encode(inputPrompt).length;

  return getProviderCostsWithTokens(inputTokens, outputTokensExpected, model);
}

function getProviderCostsWithTokens(
  inputTokens: number,
  outputTokens: number,
  model: string
) {
  const prices = AI_MODELS_INFO[model];

  const inputCost = (inputTokens / 1000000) * prices.inputTokensPerM;
  const outputCost = (outputTokens / 1000000) * prices.outputTokensPerM;

  return inputCost + outputCost;
}

export function getPrimarySourceBudget(model: string) {
  const maxTokens = AI_MODELS_INFO[model].totalTokenLimit;
  const maxOutputTokens = AI_MODELS_INFO[model].outputTokenLimit;
  const outlineMessages = getOutlineInferenceMessages(
    "This is some title",
    "",
    "This is a long ass description of some sort meant to test things. The idea is just to get a sense of token cost with the base prompts and then add a good enough budget on top of it.",
    "Crew Management, Maritime Planning, Compliance Calculation, Scheduling, System Architecture, Usage",
    "AI/ML practitioners, Researchers in AI/ML, Entrepreneurs in AI/ML, Software engineers, Technical decision-makers, Developers working with LLMs, AI/ML students and learners, Managers in AI-driven businesses, Technical content writers, Documenters of AI/ML frameworks",
    "",
    ""
  );

  const outline: Outline = {
    title: "Lorem ipsum dolor amet",
    sections: [
      {
        title: "formatResponseMessage",
        permalink: "format-response-message",
        singleSentenceDescription:
          "Information on the formatResponseMessage utility function and its purpose.",
        keythingsToCover: ["something", "something else"],
        disabled: false
      }
    ]
  };

  const writingMessages = getPageGenerationInferenceMessages(
    outlineMessages,
    outline,
    outline.sections[0],
    true
  );

  const writingTokens = countTokens(
    writingMessages.map((m) => m.content).join("\n")
  );

  const OUTLINE_BUDGET = maxOutputTokens * 3;

  const WRITING_BUDGET = maxOutputTokens * 4;

  return maxTokens - (OUTLINE_BUDGET + WRITING_BUDGET + writingTokens);
}
