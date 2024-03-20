import { MessageParam } from "@anthropic-ai/sdk/resources";
import { countTokens } from "@anthropic-ai/tokenizer";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import {
  lumentisFolderPath,
  MESSAGES_FOLDER,
  NUMBER_OF_CHARACTERS_TO_FLUSH_TO_FILE,
} from "./constants";

export async function runClaudeInference(
  messages: MessageParam[],
  model: string,
  maxOutputTokens: number,
  apiKey?: string,
  streamToConsole: boolean = false,
  saveName?: string,
  jsonType?: "parse" | "started_array" | "started_object",
  saveToFilepath?: string,
  prefix?: string
) {
  const messageBackupSpot = path.join(lumentisFolderPath, MESSAGES_FOLDER);

  if (saveName) {
    if (!fs.existsSync(messageBackupSpot)) fs.mkdirSync(messageBackupSpot);
    fs.writeFileSync(
      path.join(messageBackupSpot, saveName + ".json"),
      JSON.stringify(messages, null, 2)
    );
  }

  try {
    const anthropic = apiKey ? new Anthropic() : new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      messages,
      model,
      max_tokens: maxOutputTokens,
      stream: true,
    });

    let outputTokens = 0,
      fullMessage = "",
      diffToFlush = 0;

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
      } else if (jsonType == "started_array") {
        fullMessage = "[" + fullMessage;

        fullMessage = fullMessage.split("```")[0];
      } else if (jsonType == "started_object") {
        fullMessage = "{" + fullMessage;

        fullMessage = fullMessage.split("```")[0];
      }
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
      response: jsonType ? JSON.parse(fullMessage) : fullMessage,
    };
  } catch (err) {
    console.error(err);

    return {
      success: false,
      error: (err as Error).toString(),
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
      outputTokensPerM: 75,
    },
    "claude-3-sonnet-20240229": {
      inputTokensPerM: 3,
      outputTokensPerM: 15,
    },
    "claude-3-haiku-20240307": {
      inputTokensPerM: 0.25,
      outputTokensPerM: 1.25,
    },
  };

  const prices = priceList[model];

  const inputCost = (inputTokens / 1000000) * prices.inputTokensPerM;
  const outputCost = (outputTokens / 1000000) * prices.outputTokensPerM;

  return inputCost + outputCost;
}
