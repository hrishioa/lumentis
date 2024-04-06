import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources";
import { countTokens } from "@anthropic-ai/tokenizer";
import {
  MESSAGES_FOLDER,
  NUMBER_OF_CHARACTERS_TO_FLUSH_TO_FILE,
  lumentisFolderPath
} from "./constants";
import {
  getOutlineInferenceMessages,
  getPageGenerationInferenceMessages
} from "./prompts";
import { Outline } from "./types";
import { partialParse } from "./utils";

export async function runClaudeInference(
  messages: MessageParam[],
  model: string,
  maxOutputTokens: number,
  apiKey?: string,
  streamToConsole = false,
  saveName?: string,
  jsonType?: "parse" | "started_array" | "started_object",
  saveToFilepath?: string,
  prefix?: string,
  continueOnPartialJSON?: boolean
) {
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
    const anthropic = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
    const response = await anthropic.messages.create({
      messages,
      model,
      max_tokens: maxOutputTokens,
      stream: true
    });

    let outputTokens = 0;
    let fullMessage = "";
    let diffToFlush = 0;

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

      if (chunk.type === "message_delta")
        outputTokens += chunk.usage.output_tokens;

      if (streamToConsole) process.stdout.write(chunkText);

      fullMessage += chunkText;

      if (saveToFilepath) {
        diffToFlush += chunkText.length;

        if (diffToFlush > NUMBER_OF_CHARACTERS_TO_FLUSH_TO_FILE) {
          diffToFlush = 0;
          fs.writeFileSync(saveToFilepath, (prefix || "") + fullMessage);
        }
      }
    }

    if (streamToConsole) process.stdout.write("\n\n");

    if (jsonType) {
      if (jsonType === "parse") {
        const matchedJSON = fullMessage.match(/```json([\s\S]*?)```/g);

        if (matchedJSON) {
          fullMessage = matchedJSON[0]
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();
        }
      } else if (jsonType === "started_array") {
        fullMessage = "[" + fullMessage;

        fullMessage = fullMessage.split("```")[0];
      } else if (jsonType === "started_object") {
        fullMessage = "{" + fullMessage;

        fullMessage = fullMessage.split("```")[0];
      }
    }

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
          const continuance = await runClaudeInference(
            newMessages,
            model,
            maxOutputTokens,
            apiKey,
            streamToConsole,
            saveName,
            undefined,
            undefined,
            undefined,
            false
          );

          if (continuance.success === false) {
            const sortOfPartialJSON = partialParse(potentialPartialJSON);
            fullMessage = JSON.stringify(sortOfPartialJSON, null, 2);
          }

          potentialPartialJSON += continuance.response;
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

    return {
      success: true,
      outputTokens,
      response: jsonType ? JSON.parse(fullMessage) : fullMessage
    };
  } catch (err) {
    console.error(err);

    return {
      success: false,
      error: (err as Error).toString()
    };
  }
}

export function getClaudeCosts(
  messages: MessageParam[],
  outputTokensExpected: number,
  model: string
) {
  const inputText: string = messages.map((m) => m.content).join("\n");
  return getClaudeCostsFromText(inputText, outputTokensExpected, model);
}

export function getClaudeCostsFromText(
  inputPrompt: string,
  outputTokensExpected: number,
  model: string
) {
  const inputTokens = countTokens(inputPrompt);

  return getClaudeCostsWithTokens(inputTokens, outputTokensExpected, model);
}

function getClaudeCostsWithTokens(
  inputTokens: number,
  outputTokens: number,
  model: string
) {
  const priceList: Record<
    string,
    { inputTokensPerM: number; outputTokensPerM }
  > = {
    "claude-3-opus-20240229": {
      inputTokensPerM: 15,
      outputTokensPerM: 75
    },
    "claude-3-sonnet-20240229": {
      inputTokensPerM: 3,
      outputTokensPerM: 15
    },
    "claude-3-haiku-20240307": {
      inputTokensPerM: 0.25,
      outputTokensPerM: 1.25
    }
  };

  const prices = priceList[model];

  const inputCost = (inputTokens / 1000000) * prices.inputTokensPerM;
  const outputCost = (outputTokens / 1000000) * prices.outputTokensPerM;

  return inputCost + outputCost;
}

export const CLAUDE_PRIMARYSOURCE_BUDGET = (() => {
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

  const OUTLINE_BUDGET = 4096 * 3;

  const WRITING_BUDGET = 4096 * 4;

  return 200000 - (OUTLINE_BUDGET + WRITING_BUDGET + writingTokens);
})();
