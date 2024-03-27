<h1 align="center">
  <br>
  <a href="https://github.com/hrishioa/lumentis"><img src="https://github.com/hrishioa/lumentis/assets/973967/73832318-5e90-4191-bbbb-324524ff4468" alt="Lumentis" width="200"></a>
  <br>
<code>npx lumentis</code>
  <br>
</h1>

<h3 align="center">Generate beautiful docs from your transcripts and unstructured information with a single command.</h3>

A simple way to generate comprehensive, easy-to-skim docs from your meeting transcripts and large documents.

[![Twitter Follow](https://img.shields.io/twitter/follow/hrishi?style=social)](https://twitter.com/hrishioa)

</div>

<div align="center">

![lumentis](https://github.com/hrishioa/lumentis/assets/973967/cd16bc41-bd8a-40b6-97b0-c3b57d4650cb)

</div>

## How to use

1. Run `npx lumentis` in an empty directory. That's really it. You can skip the rest of this README.
2. Feed it a transcript, doc or notes when asked.
3. Answer some questions about themes and audience.
4. Pick what you like from the generated outline.
5. Wait for your docs to be written up!
6. [Deploy your docs to Vercel](https://vercel.com/docs/deployments/overview) by pushing your folder and following the guide.

## Examples

Lumentis lets you swap models between stages. Here's some docs exactly as Lumentis generated them, no editing. I just hit Enter a few times.

1. **[The Feynman Lectures on Physics](https://feynman-lectures.vercel.app/)** - taken from the [5 hour Feynman Lectures](https://www.youtube.com/watch?v=kEx-gRfuhhk), this is Sonnet doing the hard work for 72 cents, and Haiku writing it out for 38 cents.
2. **[Designing Frictionless Interfaces for Google](https://designing-better-ui.vercel.app/)** - Mustafa Kurtuldu gave a wonderful talk on design and UX I wish more people would watch. Now you can read it. [(Do still watch it)](https://www.youtube.com/watch?v=Drf5ZKd4aVY) but this is Haiku doing the whole thing for less than 8 (not eighty) cents!
3. **[How the AI in Spiderman 2 works](https://spiderman-2-ai-mechanics.vercel.app/)** - from [something that's been on my list](https://www.youtube.com/watch?v=LxWq65CZBU8) for a long time. Opus took about $3.80 to do the whole thing.
4. **[Sam Altman and Lex Friedman on GPT-5](https://sam-lex-gpt5.vercel.app/)** - Sam and Lex [had a conversation](https://www.youtube.com/watch?v=jvqFAi7vkBc) recently. Here's Opus doing the hard work for $2.3, and Sonnet doing the rest for $2.5. This is the expensive option.
5. **[Self-Discover in DSPy with Chris Dossman](https://lumentis-autogen-dspy-weviate-podcast.vercel.app/)** - [an interesting conversation between Chris Dossman and Weviate](https://www.youtube.com/watch?v=iC64q1gFWiY) about DSPy and structured reasoning, one of the core concepts behind the framework. [Eugene](https://github.com/eugene-yaroslavtsev) splurged something like $25 on this 😱 because he wanted to see how Lumentis would do at its best.

## Features

- Cost before run: Lumentis will dynamically tell you what each operation costs.
- Switch models: Use a smarter model to do the hard parts, and a cheaper model for long-form work. See the examples.
- Easy to change: Ctrl+C at any time and restart. Lumentis remembers your responses, and lets you change them.
- Everything in the open: want to know how it works? Check the `.lumentis` folder to see every message and response to the AI.
- Super clean: Other than `.lumentis` with the prompts and state, you have a clean project to do anything with. Git/Vercel/Camera ready.
- Super fast: (If you run with `bun`. Can't vouch for npm.)

## How it works

Lumentis reads your transcript and:

1. Asks you some questions to understand the themes and audience. Also to surf the latent space or things.
2. Generates an outline and asks you to select what you want to keep.
3. Auto generates structure from the information and further refines it with your input, while self-healing things.
4. Generates detailed pages with visual variety, formatting and styles.

## Coming soon (when I have a free night)

1. Folders
2. PDFs
3. Auto-transcription with a rubber ducky
4. Scraping entire websites
5. Scientific papers
6. Recursive summarisation and expansion
7. Continuously updating docs

## Development

```bash
git clone https://github.com/hrishioa/lumentis.git
cd lumentis
bun install
bun run run
```

Using bun because it's fast. You can also use npm or yarn if you prefer.

## How to help

Try it out and let me know the URL so I can add it here! There's also some badly organized things in `TODO.md` that I need to get around to.

# Contributors

1. [HebeHH](https://github.com/HebeHH) for adding favicons 🫶
2. [Eugene](https://github.com/eugene-yaroslavtsev) for adding biome and providing type safety fixes, and adding a fully-Opus example.
3. [Calm-Rock](https://github.com/Calm-Rock) for fixing the repo links!
