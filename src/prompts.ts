import type { MessageParam } from "@anthropic-ai/sdk/resources";
import { Outline, OutlineSection } from "./types";

export function getTitleInferenceMessages(
  primarySource: string,
  description: string
): MessageParam[] {
  return [
    // prettier-ignore
    {
      role: "user",
      content: `<PrimarySource>
${primarySource}
</PrimarySource>

${description}

Please generate up to 10 possible names for documentation we want to build, for the data in PrimarySource. Return them as a JSON array of strings without markdown code blocks.`
    },
    {
      role: "assistant",
      content: "["
    }
  ];
}

export function getAudienceInferenceMessages(
  primarySource: string,
  description: string
): MessageParam[] {
  return [
    // prettier-ignore
    {
      role: "user",
      content: `<PrimarySource>
${primarySource}
</PrimarySource>

${description}

Please generate up to 10 words describing the intended audience for creating documentation from the data in PrimarySource (which level, what type of job, etc). Return them as a JSON array of strings without markdown code blocks.`
    },
    {
      role: "assistant",
      content: "["
    }
  ];
}

export function getThemeInferenceMessages(
  primarySource: string
): MessageParam[] {
  return [
    // prettier-ignore
    {
      role: "user",
      content: `<PrimarySource>
${primarySource}
</PrimarySource>

Please generate up to 10 possible keywords referring to industries, technologies, people or other themes for the data in PrimarySource. Return them as a JSON array of strings without markdown code blocks.`
    },
    {
      role: "assistant",
      content: "["
    }
  ];
}

export function getDescriptionInferenceMessages(
  primarySource: string
): MessageParam[] {
  return [
    // prettier-ignore
    {
      role: "user",
      content: `<PrimarySource>
${primarySource}
</PrimarySource>

Please provide a three sentence description of the information in PrimarySource. Is this a conversation transcript, an article, etc? What is it about? what are the key themes and who is this likely by and for? No newlines.
`
    }
  ];
}

export function getQuestionsInferenceMessages(
  primarySource: string,
  description: string,
  alreadyAnsweredQuestions?: string
): MessageParam[] {
  return [
    // prettier-ignore
    {
      role: "user",
      content: `<PrimarySource>
${primarySource}
</PrimarySource>

${description}

${
  alreadyAnsweredQuestions
    ? `Here are some questions already asked and partially answered.
<PastQuestions>
${alreadyAnsweredQuestions}
</PastQuestions>`
    : ""
}

We want to build proper comprehensive docs for what's in PrimarySource. Can you give me a JSON array of strings, of 10 questions about things that might be confusing, need more explanation, or color?
`
    },
    {
      role: "assistant",
      content: "["
    }
  ];
}

export function getOutlineRegenerationInferenceMessages(
  outlineGenerationMessages: MessageParam[],
  selectedOutline: Outline,
  newSections: string
): MessageParam[] {
  return [
    ...outlineGenerationMessages.slice(0, -1),
    {
      role: "assistant",
      content: JSON.stringify(selectedOutline)
    },
    // prettier-ignore
    {
      role: "user",
      content: `Can you regenerate the outline with the following requests or new sections? ${newSections}
Follow the Outline typespec.
`
    },
    {
      role: "assistant",
      content: "{"
    }
  ];
}

export function getOutlineInferenceMessages(
  title: string,
  primarySource: string,
  description: string,
  themes: string,
  intendedAudience: string,
  ambiguityExplained?: string,
  writingExample?: string
): MessageParam[] {
  return [
    // prettier-ignore
    {
      role: "user",
      content: `The following is some information about ${title}.

<PrimarySource>
${primarySource}
</PrimarySource>

${description}

${
  ambiguityExplained
    ? `Here are some questions that can help with any ambiguity or things that need explaining in PrimarySource. Feel free to use your knowledge for the things I haven't answered.
<Questions>
${ambiguityExplained}
</Questions>
`
    : ""
}

Here are some of the themes covered in PrimarySource:
<Themes>
${themes}
</Themes>

Here are the intended audience for the documentation:
<Audience>
${intendedAudience}
</Audience>

${
  writingExample
    ? `Here's an example of the kind of writing we're looking for:
<WritingExample>
${writingExample}
</WritingExample>`
    : ""
}

Let's use PrimarySource to generate good documentation. Can you generate a JSON of the outline of this documentation (sections, subsections, permalinks, etc) following this typespec? Ideally the first section doens't have any subsections.

\`\`\`typescript
type OutlineSection = {
  title: string;
  permalink: string; // something easier to use as identifier
  singleSentenceDescription: string;
  subsections?: OutlineSection[];
};

type Outline = {
  title: string;
  sections: OutlineSection[];
};
`
    },
    {
      role: "assistant",
      content: "{"
    }
  ];
}

const optionalWritingGuidelines = {
  diagramsAndLatex: {
    guideline:
      "Add mermaid diagrams in markdown (```mermaid) and latex (surrounded by $) when needed.",
    index: 1
  },
  deeplyTechnical: {
    index: 3,
    guideline:
      "Only write about what is in PrimarySource, for the intended audience at their level of understanding about things they care about."
  }
};

// prettier-ignore
const writingGuidelines = [
  `Write in mdx, with appropriate formatting (bold, italics, headings, bullet points, <Callout>, <Steps> etc). We're going to use this as a page in nextra-docs. Use Callouts when needed. Steps look like this:
<Steps>
### Step 1

Contents

### Step 2

Contents
</Steps>`,
  "Write only the section, no need to talk to me when you're writing it.",
  "Write it as an expert in the themes, but for the intended audience",
  "Don't put mdx code blocks around the output, just start writing.",
  "Each subsection and section will have its own page. Just write the specific one you're asked to write.",
  "Be casually direct, confident and straightforward. Use appropriate examples when needed.",
  "Add links to subsections or other sections. The links should be in the format of [linktext](/section-permalink/subsection-permalink). Use / as the permalink for the intro section.",
  "Provide examples when needed.",
  "Make sure to start headings in each section and subsection at the top level (#)."
];

export function getPageGenerationInferenceMessages(
  outlineGenerationMessages: MessageParam[],
  selectedOutline: Outline,
  selectedSection: OutlineSection,
  addDiagrams: boolean
): MessageParam[] {
  const actualWritingGuidelines = addDiagrams
    ? [
        ...writingGuidelines.slice(
          0,
          optionalWritingGuidelines.diagramsAndLatex.index
        ),
        optionalWritingGuidelines.diagramsAndLatex.guideline,
        ...writingGuidelines.slice(
          optionalWritingGuidelines.diagramsAndLatex.index
        )
      ]
    : writingGuidelines.slice(0, -1);

  return [
    ...outlineGenerationMessages.slice(0, -1),
    {
      role: "assistant",
      content: JSON.stringify(selectedOutline)
    },
    // prettier-ignore
    {
      role: "user",
      content: `Now we're going to specifically write the section ${
        selectedSection.title
      } (permalink: ${selectedSection.permalink}) in mdx, following these guidelines:

${actualWritingGuidelines.map((g, i) => `${i + 1}. ${g}`).join("\n")}
${
  selectedSection.subsections
    ? `${
        actualWritingGuidelines.length + 1
      }The subsections ${selectedSection.subsections
        .map((s) => s.title)
        .join(", ")} will be written later, and don't need to elaborated here.`
    : ""
}`
    }
  ];
}
