/*
* output.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/

import { dirname, extname, isAbsolute, join, relative } from "path/mod.ts";

import { writeFileToStdout } from "../../core/console.ts";
import { dirAndStem, expandPath } from "../../core/path.ts";
import { partitionYamlFrontMatter } from "../../core/yaml.ts";
import { execProcess } from "../../core/process.ts";
import { binaryPath } from "../../core/resources.ts";
import { createSessionTempDir, sessionTempFile } from "../../core/temp.ts";

import {
  kIncludeAfterBody,
  kKeepSource,
  kKeepYaml,
  kOutputExt,
  kOutputFile,
  kTemplate,
  kVariant,
} from "../../config/constants.ts";
import { Format, isHtmlOutput } from "../../config/format.ts";

import { havePandocArg, kStdOut, replacePandocArg } from "./flags.ts";
import { PandocOptions } from "./pandoc.ts";
import { RenderContext } from "./render.ts";
import {
  quartoLatexmkOutputRecipe,
  useQuartoLatexmk,
} from "./latexmk/latexmk.ts";

// render commands imply the --output argument for pandoc and the final
// output file to create for the user, but we need a 'recipe' to go from
// this spec to what we should actually pass to pandoc on the command line.
// considerations include providing the default extension, dealing with
// output to stdout, and rendering pdfs (which can require an additional
// step after pandoc e.g. for latexmk)

export const kPatchedTemplateExt = ".patched";

export interface OutputRecipe {
  // --output file that pandoc will produce
  output: string;
  // transformed pandoc args reflecting 'output'
  args: string[];
  // modifications to format spec
  format: Format;
  // callback for completing the output recipe (e.g. might run pdflatex, etc.).
  // can optionally return an alternate output path. passed the actual
  // options used to run pandoc (for deducing e.g. pdf engine options)
  complete: (options: PandocOptions) => Promise<string | void>;
}

export async function outputRecipe(
  context: RenderContext,
): Promise<OutputRecipe> {
  // alias
  const input = context.target.input;
  const options = context.options;
  const format = context.format;

  // determine if an output file was specified (could be on the command line or
  // could be within metadata) and ensure it is an absolute path
  // could be within metadata)
  let output = options.flags?.output;
  if (!output) {
    const outputFile = format.pandoc[kOutputFile];
    if (outputFile) {
      if (isAbsolute(outputFile)) {
        output = outputFile;
      } else {
        output = join(dirname(input), outputFile);
      }
    } else {
      output = "";
    }
  } else {
    if (!isAbsolute(output)) {
      output = join(Deno.cwd(), output);
    }
  }

  if (useQuartoLatexmk(format, options.flags)) {
    return quartoLatexmkOutputRecipe(input, output, options, format);
  } else {
    // default recipe spec based on user input
    const completeActions: VoidFunction[] = [];

    const recipe = {
      output,
      args: options.pandocArgs || [],
      format: { ...format },
      complete: (): Promise<string | void> => {
        completeActions.forEach((action) => action());
        return Promise.resolve();
      },
    };

    // keep source if requested (and we are targeting html)
    if (format.render[kKeepSource] && isHtmlOutput(format.pandoc, true)) {
      format.pandoc[kIncludeAfterBody] = format.pandoc[kIncludeAfterBody] || [];
      format.pandoc[kIncludeAfterBody]?.push(embeddedSourceCode(input));
    }

    // patch templates as necessary (don't patch if there is a user specified template)
    if (
      !format.pandoc[kTemplate] && !havePandocArg(recipe.args, "--template")
    ) {
      if (format.pandoc.to && isHtmlOutput(format.pandoc.to, true)) {
        recipe.format.pandoc[kTemplate] = await patchHtmlTemplate(
          format.pandoc.to,
        );
      }
    }

    // helper function to re-write output
    const updateOutput = (output: string) => {
      recipe.output = output;
      if (options.flags?.output) {
        recipe.args = replacePandocArg(recipe.args, "--output", output);
      } else {
        format.pandoc[kOutputFile] = output;
      }
    };

    // determine ext
    const ext = format.render[kOutputExt] || "html";

    // compute dir and stem
    const [inputDir, inputStem] = dirAndStem(input);

    // tweak pandoc writer if we have extensions declared
    if (format.render[kVariant]) {
      recipe.format = {
        ...recipe.format,
        pandoc: {
          ...recipe.format.pandoc,
          to: `${format.pandoc.to}${format.render[kVariant]}`,
        },
      };
    }

    // complete hook for keep-yaml (to: markdown already implements keep-yaml by default)
    if (
      format.render[kKeepYaml] &&
      !/^markdown(\+|$)/.test(format.pandoc.to || "") &&
      !format.pandoc.to?.startsWith("gfm")
    ) {
      completeActions.push(() => {
        // read yaml and output markdown
        const yamlMd = partitionYamlFrontMatter(
          Deno.readTextFileSync(input),
        );
        if (yamlMd) {
          const outputMd = Deno.readTextFileSync(recipe.output);
          Deno.writeTextFileSync(
            recipe.output,
            yamlMd.yaml + "\n\n" + outputMd,
          );
        }
      });
    }

    if (!recipe.output) {
      // no output specified: derive an output path from the extension

      // special case for .md to .md, need to use the writer to create a unique extension
      let outputExt = ext;
      if (extname(input) === ".md" && ext === "md") {
        outputExt = `${format.pandoc.to}.md`;
      }
      updateOutput(inputStem + "." + outputExt);
    } else if (recipe.output === kStdOut) {
      // output to stdout: direct pandoc to write to a temp file then we'll
      // forward to stdout (necessary b/c a postprocesor may need to act on
      // the output before its complete)
      recipe.output = sessionTempFile({ suffix: "." + ext });
      completeActions.push(() => {
        writeFileToStdout(recipe.output);
        Deno.removeSync(recipe.output);
      });
    } else if (!isAbsolute(recipe.output)) {
      // relatve output file on the command line: make it relative to the input dir
      // for pandoc (which will run in the input dir)
      updateOutput(relative(inputDir, recipe.output));
    } else {
      // absolute path may need ~ substitution
      updateOutput(expandPath(recipe.output));
    }

    // return
    return recipe;
  }
}

function embeddedSourceCode(file: string) {
  const code = Deno.readTextFileSync(file);
  const scriptTag =
    `<script id="quarto-embedded-source-code" type="text/plain">\n${code}</script>`;
  const tempFile = sessionTempFile({ suffix: ".html" });
  Deno.writeTextFileSync(tempFile, scriptTag);
  return tempFile;
}

async function patchHtmlTemplate(format: string) {
  return await patchTemplate(format, (template) => {
    // extract/capture css
    let css = "";
    let patchedTemplate = template.replace(
      /\$for\(css\)\$[\W\w]+?\$endfor\$/,
      (match) => {
        css = match;
        return "";
      },
    );
    if (css) {
      let patched = false;
      patchedTemplate = patchedTemplate.replace(/^<\/head>$/m, (match) => {
        patched = true;
        return css + "\n" + match;
      });
      // if we didn't patch it then revert to the original template
      if (!patched) {
        patchedTemplate = template;
      }
    }

    // extra stuff so reveal works with jupyter widgets
    if (format === "revealjs") {
      patchedTemplate = patchRevealsJsTemplate(template);
    }
    return patchedTemplate;
  });
}

function patchRevealsJsTemplate(template: string) {
  template = template.replace(
    /(<script src="\$revealjs-url\$\/dist\/reveal.js"><\/script>)/m,
    "<script>window.backupDefine = window.define; window.define = undefined;</script>\n  $1",
  );
  template = template.replace(
    /(<script src="\$revealjs-url\$\/plugin\/math\/math.js"><\/script>\n\$endif\$)/,
    "$1\n  <script>window.define = window.backupDefine; window.backupDefine = undefined;</script>\n",
  );
  return template;
}

async function patchTemplate(
  format: string,
  patch: (template: string) => string,
) {
  // get the default pandoc template for the format
  const result = await execProcess({
    cmd: [binaryPath("pandoc"), "-D", format],
    stdout: "piped",
  });

  // transform it
  if (result.success) {
    const patched = patch(result.stdout!);

    // write a temp file w/ the patched template
    const templateDir = createSessionTempDir();
    const template = await Deno.makeTempFile(
      { suffix: kPatchedTemplateExt, dir: templateDir },
    );
    await Deno.writeTextFile(template, patched);

    return template;
  } else {
    throw new Error();
  }
}
