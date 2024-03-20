import fs from "fs";
import path from "path";
import { LUMENTIS_FOLDER, RUNNERS } from "./constants";
import { execSync } from "child_process";
import { WizardState } from "./types";

function writeConfigFiles(directory: string, wizardState: WizardState) {
  let packageJSON = fs.existsSync(path.join(directory, "package.json"))
    ? JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8"))
    : {};

  packageJSON = {
    ...packageJSON,
    name: wizardState.title + " - made with Lumentis",
    description: wizardState.description,
    version: "0.0.1",
    scripts: {
      dev: "URL=http://localhost:3000 && (open $URL || cmd.exe /c start $URL) && next dev",
      build: "next build",
      start: "next start",
    },
    keywords: wizardState.coreThemes?.split(",").map((kw) => kw.trim()) || [],
  };

  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify(packageJSON, null, 2)
  );

  fs.writeFileSync(
    path.join(directory, "next.config.js"),
    `module.exports = require("nextra")({
      theme: "nextra-theme-docs",
      themeConfig: "./theme.config.jsx",
      titleSuffix: "${wizardState.title}",
    })();`
  );

  fs.writeFileSync(
    path.join(directory, "theme.config.jsx"),
    `export default {
      logo: <span>${wizardState.title} - made with Lumentis</span>,
      editLink: {
        component: null,
      },
      project: {
        link: "https://github.com/hrishioa/lumentis",
      },
      feedback: {
        content: null,
      },
      head: (
        <>
          <meta property="og:title" content="${wizardState.title}" />
          <meta property="og:description" content="${wizardState.description}" />
          <meta name="robots" content="noindex, nofollow" />
        </>
      ),
    };
    `
  );

  fs.writeFileSync(
    path.join(directory, ".gitignore"),
    `.DS_Store
.next/
node_modules/
*.log
dist/
.turbo/
out/
# Theme styles
packages/nextra-theme-*/style.css

# Stork related
*/**/public/*.st
*/**/public/*.toml

.vercel
.idea/
.eslintcache
.env

tsup.config.bundled*
tsconfig.tsbuildinfo

${LUMENTIS_FOLDER}`
  );

  // prettier-ignore
  fs.writeFileSync(
    path.join(directory, "README.md"),
`## ${wizardState.title} - made with Lumentis

\`curl -fsSL https://bun.sh/install | bash # Install bun for macOS, Linux, and WSL\`

\`bun install\`

\`bun dev\`

Change things in \`pages\` to see the effect.
`
  )

  if (!fs.existsSync(path.join(directory, "pages"))) {
    fs.mkdirSync(path.join(directory, "pages"));
  }
}

export function idempotentlySetupNextraDocs(
  directory: string,
  runner: (typeof RUNNERS)[number],
  wizardState: WizardState
) {
  if (fs.existsSync(path.join(directory, "package.json"))) {
    console.log("Looks like project directory should be set up, skipping...");
    return;
  }

  try {
    execSync(
      `${runner.command} ${runner.installPrefix} react react-dom nextra nextra-theme-docs`,
      {
        cwd: directory,
        stdio: "inherit",
      }
    );
  } catch (err) {
    throw new Error(`Failed to install Requirements: ${err}`);
  }

  writeConfigFiles(directory, wizardState);
}
