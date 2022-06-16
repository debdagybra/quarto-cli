/*
* template.ts
*
* Copyright (C) 2021 by RStudio, PBC
*
*/

import {
  ExtensionSource,
  extensionSource,
} from "../../../extension/extension-host.ts";
import { error, info } from "log/mod.ts";
import { Confirm, Input, Select } from "cliffy/prompt/mod.ts";
import { Options } from "../cmd.ts";
import { basename, dirname, join, relative } from "path/mod.ts";
import { ensureDir, ensureDirSync, existsSync } from "fs/mod.ts";
import { TempContext } from "../../../core/temp-types.ts";
import { downloadWithProgress } from "../../../core/download.ts";
import { withSpinner } from "../../../core/console.ts";
import { unzip } from "../../../core/zip.ts";
import { templateFiles } from "../../../extension/template.ts";
import { kExtensionDir } from "../../../extension/extension-shared.ts";

export const templateHandler = {
  type: "template",
  handler: async (
    options: Options,
    tempContext: TempContext,
    target?: string,
  ) => {
    if (target) {
      // Resolve extension host and trust
      const source = extensionSource(target);
      const trusted = await isTrusted(source, options.prompt !== false);
      if (trusted) {
        // Resolve target directory
        const outputDirectory = await determineDirectory();

        // Extract and move the template into place
        const stagedDir = await stageTemplate(source, tempContext);

        // Filter the list to template files
        const filesToCopy = templateFiles(stagedDir);

        // Copy the files
        await withSpinner({ message: "Copying files..." }, async () => {
          for (const fileToCopy of filesToCopy) {
            const isDir = Deno.statSync(fileToCopy).isDirectory;
            if (!isDir) {
              const rel = relative(stagedDir, fileToCopy);
              const target = join(outputDirectory, rel);
              const targetDir = dirname(target);
              await ensureDir(targetDir);
              await Deno.copyFile(fileToCopy, target);
            }
          }
        });

        info(
          `\n${target} configured for ${relative(Deno.cwd(), outputDirectory)}`,
        );
        filesToCopy.map((file) => {
          return relative(stagedDir, file);
        })
          .filter((file) => !file.startsWith(kExtensionDir))
          .forEach((file) => {
            info(` - ${file}`);
          });
      } else {
        return Promise.resolve();
      }
    } else {
      error("Please provide a url, path, or GitHub repo to use as a template.");
    }
  },
};

async function stageTemplate(
  source: ExtensionSource,
  tempContext: TempContext,
) {
  if (source.type === "remote") {
    // A temporary working directory
    const workingDir = tempContext.createDir();

    // Stages a remote file by downloading and unzipping it
    const archiveDir = join(workingDir, "archive");
    ensureDirSync(archiveDir);

    // The filename
    const filename = source.resolvedTarget.split("/").pop() || "extension.zip";

    // The tarball path
    const toFile = join(archiveDir, filename);

    // Download the file
    await downloadWithProgress(source.resolvedTarget, `Downloading`, toFile);

    // Unzip and remove zip
    await unzipInPlace(toFile);

    if (source.targetSubdir) {
      return join(archiveDir, source.targetSubdir);
    } else {
      return archiveDir;
    }
  } else {
    if (Deno.statSync(source.resolvedTarget).isDirectory) {
      // copy the contents of the directory, filtered by quartoignore
      return source.resolvedTarget;
    } else {
      // A temporary working directory
      const workingDir = tempContext.createDir();
      const targetFile = join(workingDir, basename(source.resolvedTarget));

      // Copy the zip to the working dir
      Deno.copyFileSync(
        source.resolvedTarget,
        targetFile,
      );

      await unzipInPlace(targetFile);
      return workingDir;
    }
  }
}

// Determines whether the user trusts the template
async function isTrusted(
  source: ExtensionSource,
  allowPrompt: boolean,
): Promise<boolean> {
  if (allowPrompt && source.type === "remote") {
    // Write the preamble
    const preamble =
      `\nQuarto templates may execute code when documents are rendered. If you do not \ntrust the authors of the template, we recommend that you do not install or \nuse the template.`;
    info(preamble);

    // Ask for trust
    const question = "Do you trust the authors of this template";
    const confirmed: boolean = await Confirm.prompt({
      message: question,
      default: true,
    });
    return confirmed;
  } else {
    return true;
  }
}

async function determineDirectory() {
  const currentDir = Deno.cwd();
  if (directoryEmpty(currentDir)) {
    const useCurrentDir = await confirmCurrentDir();
    if (useCurrentDir) {
      return currentDir;
    } else {
      return promptForDirectory(currentDir);
    }
  } else {
    return promptForDirectory(currentDir);
  }
}

async function promptForDirectory(root: string) {
  while (true) {
    const dirName = await Input.prompt({
      message: "What directory should be created for the template?",
    });
    const dir = join(root, dirName);

    if (!existsSync(dir)) {
      ensureDirSync(dir);
      return dir;
    } else {
      if (directoryEmpty(dir)) {
        return dir;
      } else {
        info(
          `The directory '${dirName}' is not empty. Please provide the name of a new or empty directory.`,
        );
      }
    }
  }
}

async function confirmCurrentDir() {
  const dirType: string = await Select.prompt({
    indent: "",
    message: `What directory should template be expanded into?`,
    options: [
      {
        name: "Current directory",
        value: ".",
      },
      {
        name: "New directory...",
        value: "another",
      },
    ],
  });
  if (dirType === ".") {
    return true;
  } else {
    return false;
  }
}

// Unpack and stage a zipped file
async function unzipInPlace(zipFile: string) {
  // Unzip the file
  await withSpinner(
    { message: "Unzipping" },
    async () => {
      // Unzip the archive
      const result = await unzip(zipFile);
      if (!result.success) {
        throw new Error("Failed to unzip template.\n" + result.stderr);
      }

      // Remove the tar ball itself
      await Deno.remove(zipFile);

      return Promise.resolve();
    },
  );
}

function directoryEmpty(path: string) {
  const dirContents = Deno.readDirSync(path);
  for (const _content of dirContents) {
    return false;
  }
  return true;
}
