# Some things to think about adding

1. Add vscode and zed support
2. Text latex and mermaid more, make them optional?
3. Support loading in
   1. Code
      1. Simple way to start would be use `glob` to load in dir structure, let users select what they want and dump it into context
      2. Next step could be using the AST (or recursive summaries) to only capture the important bits
   2. folders (with file selection)
   3. pdfs
   4. scraping web links
   5. recursive scraping web pages
4. Add OpenAI (see if we can do it without blowing up dependencies too much)
5. Recursive summarisation?
6. \n's
7. Do we need to ask and set style separately?
8. Maybe change themes to sections we want to make sure we generate?
9. Node process still continues to run sometimes irreproducibly - weird, needs to get killed off specifically
10. Using things larger than the context window
11. We can do this by maintaining an almost DP-like state of outlines and pages, and then asking for updates with more information. Works when there's a primary source and secondaries, and also still pretty expensive.
12. OpenAI, Gemini, openrouter, etc.
13. Use relative permalinks in the prompt to make links better.
14. Variable length page generation.
