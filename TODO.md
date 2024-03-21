# Some things to think about adding

1. Add vscode and zed support
2. Support loading in
   1. folders (with file selection)
   2. pdfs
   3. scraping web links
   4. recursive scraping web pages
3. Recursive summarisation?
4. \n's
5. Do we need to ask and set style separately?
6. Maybe change themes to sections we want to make sure we generate?
7. Node process still continues to run sometimes irreproducibly - weird, needs to get killed off specifically
8. Using things larger than the context window
   1. We can do this by maintaining an almost DP-like state of outlines and pages, and then asking for updates with more information. Works when there's a primary source and secondaries, and also still pretty expensive.
9. JSON parsing on the questions set
10. Add attribution
