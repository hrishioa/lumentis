#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { countTokens } from "@anthropic-ai/tokenizer";
import dirTree from "directory-tree";
import mime from "mime-types";
import type { CheckboxInput } from "src/types";
import { parsePlatformIndependentPath } from "../utils";

// ___________________________________FILE EXCLUSIONS AND INCLUSIONS SECTION___________________________________
// Edit this section to include/exclude file types and folders from the folder tree.

// I did a bunch of scrolling through mime types to come up with this list (https://www.iana.org/assignments/media-types/media-types.xhtml)
// However there's still possibly a bunch missing.
// Be aware that not all file types are reasable with the fs.readFileSync
// we're currently using (eg: microsoft docs and excel). To add the ability
// to read these, you'll also need to add a special file reader for that file
// type.
const readableMimeTypes = ["text", "message"];
const readableApplicationSubtypes = ["json", "xml", "yaml", "rtf", "rtx"];
// This is using the Programming_Languages_Extensions.json from ppisarczyk: https://gist.github.com/ppisarczyk/43962d06686722d26d176fad46879d41
const allowed_extensions = [".abap", ".asc", ".ash", ".ampl", ".mod", ".g4", ".apib", ".apl", ".dyalog", ".asp", ".asax", ".ascx", ".ashx", ".asmx", ".aspx", ".axd", ".dats", ".hats", ".sats", ".as", ".adb", ".ada", ".ads", ".agda", ".als", ".apacheconf", ".vhost", ".cls", ".applescript", ".scpt", ".arc", ".ino", ".asciidoc", ".adoc", ".asc", ".aj", ".asm", ".a51", ".inc", ".nasm", ".aug", ".ahk", ".ahkl", ".au3", ".awk", ".auk", ".gawk", ".mawk", ".nawk", ".bat", ".cmd", ".befunge", ".bison", ".bb", ".bb", ".decls", ".bmx", ".bsv", ".boo", ".b", ".bf", ".brs", ".bro", ".c", ".cats", ".h", ".idc", ".w", ".cs", ".cake", ".cshtml", ".csx", ".cpp", ".c++", ".cc", ".cp", ".cxx", ".h", ".h++", ".hh", ".hpp", ".hxx", ".inc", ".inl", ".ipp", ".tcc", ".tpp", ".c-objdump", ".chs", ".clp", ".cmake", ".cmake.in", ".cob", ".cbl", ".ccp", ".cobol", ".cpy", ".css", ".csv", ".capnp", ".mss", ".ceylon", ".chpl", ".ch", ".ck", ".cirru", ".clw", ".icl", ".dcl", ".click", ".clj", ".boot", ".cl2", ".cljc", ".cljs", ".cljs.hl", ".cljscm", ".cljx", ".hic", ".coffee", "._coffee", ".cake", ".cjsx", ".cson", ".iced", ".cfm", ".cfml", ".cfc", ".lisp", ".asd", ".cl", ".l", ".lsp", ".ny", ".podsl", ".sexp", ".cp", ".cps", ".cl", ".coq", ".v", ".cppobjdump", ".c++-objdump", ".c++objdump", ".cpp-objdump", ".cxx-objdump", ".creole", ".cr", ".feature", ".cu", ".cuh", ".cy", ".pyx", ".pxd", ".pxi", ".d", ".di", ".d-objdump", ".com", ".dm", ".zone", ".arpa", ".d", ".darcspatch", ".dpatch", ".dart", ".diff", ".patch", ".dockerfile", ".djs", ".dylan", ".dyl", ".intr", ".lid", ".E", ".ecl", ".eclxml", ".ecl", ".sch", ".brd", ".epj", ".e", ".ex", ".exs", ".elm", ".el", ".emacs", ".emacs.desktop", ".em", ".emberscript", ".erl", ".es", ".escript", ".hrl", ".xrl", ".yrl", ".fs", ".fsi", ".fsx", ".fx", ".flux", ".f90", ".f", ".f03", ".f08", ".f77", ".f95", ".for", ".fpp", ".factor", ".fy", ".fancypack", ".fan", ".fs", ".for", ".eam.fs", ".fth", ".4th", ".f", ".for", ".forth", ".fr", ".frt", ".fs", ".ftl", ".fr", ".g", ".gco", ".gcode", ".gms", ".g", ".gap", ".gd", ".gi", ".tst", ".s", ".ms", ".gd", ".glsl", ".fp", ".frag", ".frg", ".fs", ".fsh", ".fshader", ".geo", ".geom", ".glslv", ".gshader", ".shader", ".vert", ".vrx", ".vsh", ".vshader", ".gml", ".kid", ".ebuild", ".eclass", ".po", ".pot", ".glf", ".gp", ".gnu", ".gnuplot", ".plot", ".plt", ".go", ".golo", ".gs", ".gst", ".gsx", ".vark", ".grace", ".gradle", ".gf", ".gml", ".graphql", ".dot", ".gv", ".man", ".l", ".me", ".ms", ".n", ".rno", ".roff", ".groovy", ".grt", ".gtpl", ".gvy", ".gsp", ".hcl", ".tf", ".hlsl", ".fx", ".fxh", ".hlsli", ".html", ".htm", ".html.hl", ".inc", ".st", ".xht", ".xhtml", ".mustache", ".jinja", ".eex", ".erb", ".erb.deface", ".phtml", ".http", ".hh", ".php", ".haml", ".haml.deface", ".handlebars", ".hbs", ".hb", ".hs", ".hsc", ".hx", ".hxsl", ".hy", ".bf", ".pro", ".dlm", ".ipf", ".ini", ".cfg", ".prefs", ".pro", ".properties", ".irclog", ".weechatlog", ".idr", ".lidr", ".ni", ".i7x", ".iss", ".io", ".ik", ".thy", ".ijs", ".flex", ".jflex", ".json", ".geojson", ".lock", ".topojson", ".json5", ".jsonld", ".jq", ".jsx", ".jade", ".j", ".java", ".jsp", ".js", "._js", ".bones", ".es", ".es6", ".frag", ".gs", ".jake", ".jsb", ".jscad", ".jsfl", ".jsm", ".jss", ".njs", ".pac", ".sjs", ".ssjs", ".sublime-build", ".sublime-commands", ".sublime-completions", ".sublime-keymap", ".sublime-macro", ".sublime-menu", ".sublime-mousemap", ".sublime-project", ".sublime-settings", ".sublime-theme", ".sublime-workspace", ".sublime_metrics", ".sublime_session", ".xsjs", ".xsjslib", ".jl", ".ipynb", ".krl", ".sch", ".brd", ".kicad_pcb", ".kit", ".kt", ".ktm", ".kts", ".lfe", ".ll", ".lol", ".lsl", ".lslp", ".lvproj", ".lasso", ".las", ".lasso8", ".lasso9", ".ldml", ".latte", ".lean", ".hlean", ".less", ".l", ".lex", ".ly", ".ily", ".b", ".m", ".ld", ".lds", ".mod", ".liquid", ".lagda", ".litcoffee", ".lhs", ".ls", "._ls", ".xm", ".x", ".xi", ".lgt", ".logtalk", ".lookml", ".ls", ".lua", ".fcgi", ".nse", ".pd_lua", ".rbxs", ".wlua", ".mumps", ".m", ".m4", ".m4", ".ms", ".mcr", ".mtml", ".muf", ".m", ".mak", ".d", ".mk", ".mkfile", ".mako", ".mao", ".md", ".markdown", ".mkd", ".mkdn", ".mkdown", ".ron", ".mask", ".mathematica", ".cdf", ".m", ".ma", ".mt", ".nb", ".nbp", ".wl", ".wlt", ".matlab", ".m", ".maxpat", ".maxhelp", ".maxproj", ".mxt", ".pat", ".mediawiki", ".wiki", ".m", ".moo", ".metal", ".minid", ".druby", ".duby", ".mir", ".mirah", ".mo", ".mod", ".mms", ".mmk", ".monkey", ".moo", ".moon", ".myt", ".ncl", ".nl", ".nsi", ".nsh", ".n", ".axs", ".axi", ".axs.erb", ".axi.erb", ".nlogo", ".nl", ".lisp", ".lsp", ".nginxconf", ".vhost", ".nim", ".nimrod", ".ninja", ".nit", ".nix", ".nu", ".numpy", ".numpyw", ".numsc", ".ml", ".eliom", ".eliomi", ".ml4", ".mli", ".mll", ".mly", ".objdump", ".m", ".h", ".mm", ".j", ".sj", ".omgrofl", ".opa", ".opal", ".cl", ".opencl", ".p", ".cls", ".scad", ".org", ".ox", ".oxh", ".oxo", ".oxygene", ".oz", ".pwn", ".inc", ".php", ".aw", ".ctp", ".fcgi", ".inc", ".php3", ".php4", ".php5", ".phps", ".phpt", ".pls", ".pck", ".pkb", ".pks", ".plb", ".plsql", ".sql", ".sql", ".pov", ".inc", ".pan", ".psc", ".parrot", ".pasm", ".pir", ".pas", ".dfm", ".dpr", ".inc", ".lpr", ".pp", ".pl", ".al", ".cgi", ".fcgi", ".perl", ".ph", ".plx", ".pm", ".pod", ".psgi", ".t", ".6pl", ".6pm", ".nqp", ".p6", ".p6l", ".p6m", ".pl", ".pl6", ".pm", ".pm6", ".t", ".pkl", ".l", ".pig", ".pike", ".pmod", ".pod", ".pogo", ".pony", ".ps", ".eps", ".ps1", ".psd1", ".psm1", ".pde", ".pl", ".pro", ".prolog", ".yap", ".spin", ".proto", ".asc", ".pub", ".pp", ".pd", ".pb", ".pbi", ".purs", ".py", ".bzl", ".cgi", ".fcgi", ".gyp", ".lmi", ".pyde", ".pyp", ".pyt", ".pyw", ".rpy", ".tac", ".wsgi", ".xpy", ".pytb", ".qml", ".qbs", ".pro", ".pri", ".r", ".rd", ".rsx", ".raml", ".rdoc", ".rbbas", ".rbfrm", ".rbmnu", ".rbres", ".rbtbar", ".rbuistate", ".rhtml", ".rmd", ".rkt", ".rktd", ".rktl", ".scrbl", ".rl", ".raw", ".reb", ".r", ".r2", ".r3", ".rebol", ".red", ".reds", ".cw", ".rpy", ".rs", ".rsh", ".robot", ".rg", ".rb", ".builder", ".fcgi", ".gemspec", ".god", ".irbrc", ".jbuilder", ".mspec", ".pluginspec", ".podspec", ".rabl", ".rake", ".rbuild", ".rbw", ".rbx", ".ru", ".ruby", ".thor", ".watchr", ".rs", ".rs.in", ".sas", ".scss", ".smt2", ".smt", ".sparql", ".rq", ".sqf", ".hqf", ".sql", ".cql", ".ddl", ".inc", ".prc", ".tab", ".udf", ".viw", ".sql", ".db2", ".ston", ".svg", ".sage", ".sagews", ".sls", ".sass", ".scala", ".sbt", ".sc", ".scaml", ".scm", ".sld", ".sls", ".sps", ".ss", ".sci", ".sce", ".tst", ".self", ".sh", ".bash", ".bats", ".cgi", ".command", ".fcgi", ".ksh", ".sh.in", ".tmux", ".tool", ".zsh", ".sh-session", ".shen", ".sl", ".slim", ".smali", ".st", ".cs", ".tpl", ".sp", ".inc", ".sma", ".nut", ".stan", ".ML", ".fun", ".sig", ".sml", ".do", ".ado", ".doh", ".ihlp", ".mata", ".matah", ".sthlp", ".styl", ".sc", ".scd", ".swift", ".sv", ".svh", ".vh", ".toml", ".txl", ".tcl", ".adp", ".tm", ".tcsh", ".csh", ".tex", ".aux", ".bbx", ".bib", ".cbx", ".cls", ".dtx", ".ins", ".lbx", ".ltx", ".mkii", ".mkiv", ".mkvi", ".sty", ".toc", ".tea", ".t", ".txt", ".fr", ".nb", ".ncl", ".no", ".textile", ".thrift", ".t", ".tu", ".ttl", ".twig", ".ts", ".tsx", ".upc", ".anim", ".asset", ".mat", ".meta", ".prefab", ".unity", ".uno", ".uc", ".ur", ".urs", ".vcl", ".vhdl", ".vhd", ".vhf", ".vhi", ".vho", ".vhs", ".vht", ".vhw", ".vala", ".vapi", ".v", ".veo", ".vim", ".vb", ".bas", ".cls", ".frm", ".frx", ".vba", ".vbhtml", ".vbs", ".volt", ".vue", ".owl", ".webidl", ".x10", ".xc", ".xml", ".ant", ".axml", ".ccxml", ".clixml", ".cproject", ".csl", ".csproj", ".ct", ".dita", ".ditamap", ".ditaval", ".dll.config", ".dotsettings", ".filters", ".fsproj", ".fxml", ".glade", ".gml", ".grxml", ".iml", ".ivy", ".jelly", ".jsproj", ".kml", ".launch", ".mdpolicy", ".mm", ".mod", ".mxml", ".nproj", ".nuspec", ".odd", ".osm", ".plist", ".pluginspec", ".props", ".ps1xml", ".psc1", ".pt", ".rdf", ".rss", ".scxml", ".srdf", ".storyboard", ".stTheme", ".sublime-snippet", ".targets", ".tmCommand", ".tml", ".tmLanguage", ".tmPreferences", ".tmSnippet", ".tmTheme", ".ts", ".tsx", ".ui", ".urdf", ".ux", ".vbproj", ".vcxproj", ".vssettings", ".vxml", ".wsdl", ".wsf", ".wxi", ".wxl", ".wxs", ".x3d", ".xacro", ".xaml", ".xib", ".xlf", ".xliff", ".xmi", ".xml.dist", ".xproj", ".xsd", ".xul", ".zcml", ".xsp-config", ".xsp.metadata", ".xpl", ".xproc", ".xquery", ".xq", ".xql", ".xqm", ".xqy", ".xs", ".xslt", ".xsl", ".xojo_code", ".xojo_menu", ".xojo_report", ".xojo_script", ".xojo_toolbar", ".xojo_window", ".xtend", ".yml", ".reek", ".rviz", ".sublime-syntax", ".syntax", ".yaml", ".yaml-tmlanguage", ".yang", ".y", ".yacc", ".yy", ".zep", ".zimpl", ".zmpl", ".zpl", ".desktop", ".desktop.in", ".ec", ".eh", ".edn", ".fish", ".mu", ".nc", ".ooc", ".rst", ".rest", ".rest.txt", ".rst.txt", ".wisp", ".prg", ".ch", ".prw"]

// Extensions and paths to exclude from the folder tree.
// This is a list of extensions that are generally not readable by AI models.
// Please do add to it. We'll then do an additional file check on each file,
// but this should make those operations less heavy.
const excludeExtensions = [
  ".pdf",
  ".mp4",
  ".jpg",
  ".jpeg",
  ".png",
  ".o",
  ".mov",
  ".mp3",
  ".mpg",
  ".mpeg",
  ".avi",
  ".wmv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".a",
  ".lib",
  ".obj",
  ".pyc",
  ".class",
  ".jar",
  ".war",
  ".ear",
  ".zip",
  ".tar",
  ".class",
  ".jar",
  ".war",
  ".ear",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".tgz",
  ".tar.gz",
  ".tar.bz2",
  ".tar.xz",
  ".tar.7z",
  ".tar.Z",
  ".tar.lz",
  ".tar.lzma",
  ".tar.Z",
  ".tar.lz4",
  ".tar.lzop",
  ".tar.zst",
  ".tar.sz",
  ".tar.br",
  ".tar.bz",
  ".tar.lzo",
  ".gif",
  ".bmp",
  ".svg",
  ".webp",
  ".ico",
  ".tif",
  ".tiff",
  ".heif",
  ".heic",
  ".mkv",
  ".flv",
  ".webm",
  ".wav",
  ".aac",
  ".flac",
  ".ogg"
];
const folderTreeExclusions = [
  /^.*\/\.bin$/,
  /^.*\/node_modules$/,
  /^.*\/\.vscode$/,
  /^.*\/\.git/,
  /^.*\/test$/,
  /^.*\/dist$/,
  /^.*\/build$/,
  /^.*\/out$/,
  /^.*\/target$/,
  /^.*\/venv$/,
  /^.*\/__pycache__$/,
  /^.*\/\.idea$/,
  /^.*\/\.DS_Store$/
];
export const allExclusions = folderTreeExclusions.concat(excludeExtensions.map((ex) => new RegExp(`.*${ex}$`)));

// ___________________________________CHECK FILE READABILITY___________________________________
// Recommend to the restrictions using the fields above

function checkIfFileIsProgrammingLanguage(filename: string) {
  const extension = "." + filename.split(".").pop();
  return allowed_extensions.includes(extension);
}

export function checkFileIsReadable(filename: string) {
  // Allowable if it's a code file, since most LLMs are trained on large codebases.
  // Unfortunately the mime library doesn't infer most code extensions as text,
  // It just returns 'false'. So we have to check for programming languages separately.
  if (checkIfFileIsProgrammingLanguage(filename)) {
    return true;
  }
  const mimeType = mime.lookup(filename);
  if (!mimeType) {
    return false;
  }
  const [type, subtype] = mimeType.split("/");

  if (readableMimeTypes.includes(type)) {
    return true;
  } else if (type === "application" && readableApplicationSubtypes.some((sub) => subtype.includes(sub))) {
    return true;
  }
  return false;
}

// ___________________________________PROMPTING ADJUSTMENT__________________________________
// Adjust the AI prompt for folders here

const footerPromptString = "\n</NEW_FILE>\n";
const joinString = "\n\n____________________\n\n";

function getHeaderPromptString(filepath) {
  return `<NEW_FILE: ${filepath}>\n`;
}

export function getAdditionalPromptTokens(flat_selection: { name: string; value: string }[]) {
  const promptString = flat_selection
    .filter((file) => !file.name.includes("📁"))
    .map((file) => {
      return getHeaderPromptString(file.value) + footerPromptString;
    })
    .join(joinString);
  return countTokens(promptString);
}

export function combineFilesToString(flat_selection: { name: string; value: string; checked: boolean }[]) {
  return flat_selection
    .filter((file) => !file.name.includes("📁")) // Faster but more fragile than 'fs.lstatSync(file.value).isFile()'
    .map((file) => {
      const header = getHeaderPromptString(file.value);
      const content = fs.readFileSync(parsePlatformIndependentPath(file.value), "utf-8");
      return `${header}${content}${footerPromptString}`;
    })
    .join(joinString);
}

// ___________________________________WORKER THREADS___________________________________
// Run the major work as worker threads to avoid blocking the main thread and allow timing out.
// See files starting with `worker-` for the worker scripts.

function createTimeoutPromise<T>(time = 5000, value = "timeoutFailed") {
  return new Promise<string>((resolve, reject) => {
    setTimeout(() => {
      return resolve(value);
    }, time);
  });
}

function runWorker(workerPath: string, data: string | dirTree.DirectoryTree | { tree: dirTree.DirectoryTree; user_selection: string[] }) {
  const worker = new Worker(workerPath);
  const promise = new Promise((resolve, reject) => {
    worker.postMessage(data);
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0 && code !== 1) {
        // Code 1 is used for manual termination
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
  return { worker, promise };
}

export async function getFileTree(filepath: string): Promise<dirTree.DirectoryTree | "timeoutFailed"> {
  const { worker, promise } = runWorker(path.join(__dirname, "folder-importing", "worker-dirtree.js"), filepath);
  const timeout = createTimeoutPromise(5000);
  const result = await Promise.race([promise, timeout]);
  worker.terminate();
  if (result === "timeoutFailed") {
    return "timeoutFailed";
  } else {
    return result as dirTree.DirectoryTree;
  }
}

export async function removeExcludedFilesAndAddTokenCount(
  tree: dirTree.DirectoryTree
): Promise<{ result: boolean; tokenTotal: number; tree: dirTree.DirectoryTree } | "timeoutFailed"> {
  const { worker, promise } = runWorker(path.join(__dirname, "folder-importing", "worker-clean-dirtree.js"), tree);
  const timeout = createTimeoutPromise(3000);
  const result = await Promise.race([promise, timeout]);
  worker.terminate();
  if (result === "timeoutFailed") {
    return "timeoutFailed";
  } else {
    return result as {
      result: boolean;
      tokenTotal: number;
      tree: dirTree.DirectoryTree;
    };
  }
}

export async function flattenFileTreeForCheckbox(fileTree: dirTree.DirectoryTree): Promise<CheckboxInput[] | "timeoutFailed"> {
  const { worker, promise } = runWorker(path.join(__dirname, "folder-importing", "worker-flatten-tree-for-checkbox.js"), fileTree);
  const timeout = createTimeoutPromise(2000);
  const result = await Promise.race([promise, timeout]);
  worker.terminate();
  if (result === "timeoutFailed") {
    return "timeoutFailed";
  } else {
    return result as CheckboxInput[];
  }
}

export async function removeDeselectedItems(
  tree: dirTree.DirectoryTree,
  user_selection: string[]
): Promise<{ result: boolean; tokenTotal: number; tree: dirTree.DirectoryTree } | "timeoutFailed"> {
  const { worker, promise } = runWorker(path.join(__dirname, "folder-importing", "worker-remove-deselected.js"), { tree, user_selection });
  const timeout = createTimeoutPromise(2000);
  const result = await Promise.race([promise, timeout]);
  worker.terminate();
  if (result === "timeoutFailed") {
    return "timeoutFailed";
  } else {
    return result as {
      result: boolean;
      tokenTotal: number;
      tree: dirTree.DirectoryTree;
    };
  }
}
