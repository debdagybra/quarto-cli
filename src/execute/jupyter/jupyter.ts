/*
* jupyter.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/

import { extname, join } from "path/mod.ts";

import {
  readYamlFromMarkdown,
  readYamlFromMarkdownFile,
  readYamlFrontMatterFromMarkdownFile,
} from "../../core/yaml.ts";
import { partitionMarkdown } from "../../core/pandoc/pandoc-partition.ts";

import { dirAndStem } from "../../core/path.ts";

import { Metadata } from "../../config/metadata.ts";

import type {
  DependenciesOptions,
  ExecuteOptions,
  ExecuteResult,
  ExecutionEngine,
  ExecutionTarget,
  PandocIncludes,
  PostProcessOptions,
} from "../engine.ts";
import {
  jupyterAssets,
  jupyterFromFile,
  jupyterToMarkdown,
  quartoMdToJupyter,
} from "../../core/jupyter/jupyter.ts";
import {
  kEval,
  kExecuteDaemon,
  kFigDpi,
  kFigFormat,
  kFreeze,
  kIncludeAfterBody,
  kIncludeInHeader,
  kKeepHidden,
  kKeepIpynb,
  kPreferHtml,
} from "../../config/constants.ts";
import {
  Format,
  isHtmlOutput,
  isLatexOutput,
  isMarkdownOutput,
} from "../../config/format.ts";
import { restorePreservedHtml } from "../../core/jupyter/preserve.ts";

import {
  executeKernelKeepalive,
  executeKernelOneshot,
} from "./jupyter-kernel.ts";
import {
  includesForJupyterWidgetDependencies,
  JupyterWidgetDependencies,
} from "../../core/jupyter/widgets.ts";
import {
  isJupyterKernelspec,
  JupyterKernelspec,
  jupyterKernelspec,
} from "../../core/jupyter/kernels.ts";

const kNotebookExtensions = [
  ".ipynb",
];
const kJupyterMdExtensions = [
  ".md",
  ".markdown",
];

export const jupyterEngine: ExecutionEngine = {
  name: "jupyter",

  defaultExt: ".md",

  defaultYaml: (kernel?: string) => [
    `jupyter: ${kernel || "python3"}`,
  ],

  canHandle: (file: string) => {
    if (isMarkdown(file)) {
      const yaml = readYamlFrontMatterFromMarkdownFile(file);
      return !!yaml?.jupyter;
    } else {
      return isNotebook(file);
    }
  },

  target: async (
    file: string,
  ): Promise<ExecutionTarget | undefined> => {
    // if this is a text markdown file then create a notebook for use as the execution target
    const ext = extname(file);
    if (kJupyterMdExtensions.includes(ext)) {
      // write a transient notebook
      const [kernelspec, metadata] = await jupyterKernelspecFromFile(file);
      const [fileDir, fileStem] = dirAndStem(file);
      const nb = quartoMdToJupyter(file, kernelspec, metadata);
      const notebook = join(fileDir, fileStem + ".ipynb");
      Deno.writeTextFileSync(notebook, JSON.stringify(nb, null, 2));
      return { source: file, input: notebook, data: { transient: true } };
    } else if (isNotebook(file)) {
      return { source: file, input: file, data: { transient: false } };
    } else {
      return undefined;
    }
  },

  metadata: async (file: string): Promise<Metadata> => {
    // read metadata
    if (isNotebook(file)) {
      return readYamlFromMarkdown(await markdownFromNotebook(file));
    } else {
      return readYamlFromMarkdown(Deno.readTextFileSync(file));
    }
  },

  partitionedMarkdown: async (file: string) => {
    if (isNotebook(file)) {
      return partitionMarkdown(await markdownFromNotebook(file));
    } else {
      return partitionMarkdown(Deno.readTextFileSync(file));
    }
  },

  execute: async (options: ExecuteOptions): Promise<ExecuteResult> => {
    // determine default execute behavior if none is specified
    let execute = options.format.execute[kEval];
    if (execute === null) {
      execute = !isNotebook(options.target.source) ||
        !!options.format.execute[kFreeze];
    }
    // execute if we need to
    if (execute) {
      // jupyter back end requires full path to input (to ensure that
      // keepalive kernels are never re-used across multiple inputs
      // that happen to share a hash)
      const execOptions = {
        ...options,
        target: {
          ...options.target,
          input: Deno.realPathSync(options.target.input),
        },
      };

      if (
        options.format.execute[kExecuteDaemon] === false ||
        options.format.execute[kExecuteDaemon] === 0
      ) {
        await executeKernelOneshot(execOptions);
      } else {
        await executeKernelKeepalive(execOptions);
      }
    }

    // convert to markdown and write to target
    const nb = jupyterFromFile(options.target.input);
    const assets = jupyterAssets(
      options.target.input,
      options.format.pandoc.to,
    );
    // NOTE: for perforance reasons the 'nb' is mutated in place
    // by jupyterToMarkdown (we don't want to make a copy of a
    // potentially very large notebook) so should not be relied
    // on subseuqent to this call
    const result = jupyterToMarkdown(
      nb,
      {
        language: nb.metadata.kernelspec.language,
        assets,
        execute: options.format.execute,
        keepHidden: options.format.render[kKeepHidden],
        toHtml: isHtmlCompatible(options.format),
        toLatex: isLatexOutput(options.format.pandoc),
        toMarkdown: isMarkdownOutput(options.format.pandoc),
        figFormat: options.format.execute[kFigFormat],
        figDpi: options.format.execute[kFigDpi],
      },
    );

    // return dependencies as either includes or raw dependencies
    const dependencies = executeResultDependencies(
      options.dependencies ? "includes" : "dependencies",
      result.dependencies,
    );

    // if it's a transient notebook then remove it, otherwise
    // sync so that jupyter[lab] can open the .ipynb w/o errors
    const data = options.target.data as JupyterTargetData;
    if (data.transient) {
      if (!options.format.render[kKeepIpynb]) {
        Deno.removeSync(options.target.input);
      }
    }

    // return results
    return {
      markdown: result.markdown,
      supporting: [assets.supporting_dir],
      filters: [],
      dependencies,
      preserve: result.htmlPreserve,
      postProcess: result.htmlPreserve &&
        (Object.keys(result.htmlPreserve).length > 0),
    };
  },

  executeTargetSkipped: (target: ExecutionTarget, format: Format) => {
    // remove transient notebook if appropriate
    const data = target.data as JupyterTargetData;
    if (data.transient) {
      if (!format.render[kKeepIpynb]) {
        Deno.removeSync(target.input);
      }
    }
  },

  dependencies: (options: DependenciesOptions) => {
    const includes: PandocIncludes = {};
    if (options.dependencies) {
      const includeFiles = includesForJupyterWidgetDependencies(
        options.dependencies as JupyterWidgetDependencies[],
      );
      if (includeFiles.inHeader) {
        includes[kIncludeInHeader] = includeFiles.inHeader;
      }
      if (includeFiles.afterBody) {
        includes[kIncludeAfterBody] = includeFiles.afterBody;
      }
    }
    return Promise.resolve({
      includes,
    });
  },

  postprocess: (options: PostProcessOptions) => {
    // read the output file
    let output = Deno.readTextFileSync(options.output);

    // substitute
    output = restorePreservedHtml(
      output,
      options.preserve,
    );

    // re-write the output
    Deno.writeTextFileSync(options.output, output);

    return Promise.resolve();
  },

  keepMd,

  keepFiles: (input: string) => {
    const files: string[] = [];
    const keep = keepMd(input);
    if (keep) {
      files.push(keep);
    }
    if (!isNotebook(input) && !input.endsWith(kKeepSuffix)) {
      const [fileDir, fileStem] = dirAndStem(input);
      files.push(join(fileDir, fileStem + ".ipynb"));
    }
    return files;
  },
};

export function pythonBinary(binary = "python3") {
  return binary;
}

const kKeepSuffix = ".ipynb.md";

function keepMd(input: string) {
  if (!input.endsWith(kKeepSuffix)) {
    const [dir, stem] = dirAndStem(input);
    return join(dir, stem + ".ipynb.md");
  }
}

interface JupyterTargetData {
  transient: boolean;
}

async function jupyterKernelspecFromFile(
  file: string,
): Promise<[JupyterKernelspec, Metadata]> {
  const yaml = readYamlFromMarkdownFile(file);
  if (yaml.jupyter) {
    if (typeof (yaml.jupyter) === "string") {
      const kernel = yaml.jupyter;
      const kernelspec = await jupyterKernelspec(kernel);
      if (kernelspec) {
        return [kernelspec, {}];
      } else {
        return Promise.reject(
          new Error("Jupyter kernel '" + kernel + "' not found."),
        );
      }
    } else if (typeof (yaml.jupyter) === "object") {
      const jupyter = { ...yaml.jupyter } as Record<string, unknown>;
      if (isJupyterKernelspec(jupyter.kernelspec)) {
        const kernelspec = jupyter.kernelspec;
        delete jupyter.kernelspec;
        return [kernelspec, jupyter];
      } else if (typeof (jupyter.kernel) === "string") {
        const kernelspec = await jupyterKernelspec(jupyter.kernel);
        if (kernelspec) {
          delete jupyter.kernel;
          return [kernelspec, jupyter];
        } else {
          return Promise.reject(
            new Error("Jupyter kernel '" + jupyter.kernel + "' not found."),
          );
        }
      } else {
        return Promise.reject(
          new Error(
            "Invalid Jupyter kernelspec (must include name, language, & display_name)",
          ),
        );
      }
    } else {
      return Promise.reject(
        new Error(
          "Invalid jupyter YAML metadata found in file (must be string or object)",
        ),
      );
    }
  } else {
    return Promise.reject(
      new Error("No jupyter YAML metadata found in file"),
    );
  }
}

function isNotebook(file: string) {
  return kNotebookExtensions.includes(extname(file).toLowerCase());
}

function isMarkdown(file: string) {
  return kJupyterMdExtensions.includes(extname(file).toLowerCase());
}

function isHtmlCompatible(format: Format) {
  return isHtmlOutput(format.pandoc) ||
    (isMarkdownOutput(format.pandoc) && format.render[kPreferHtml]);
}

function executeResultDependencies(
  type: "includes" | "dependencies",
  dependencies?: JupyterWidgetDependencies,
) {
  // convert dependencies to include files
  const dependenciesAsIncludes = () => {
    const includes: PandocIncludes = {};
    if (dependencies) {
      const includeFiles = includesForJupyterWidgetDependencies(
        [dependencies],
      );
      if (includeFiles.inHeader) {
        includes[kIncludeInHeader] = includeFiles.inHeader;
      }
      if (includeFiles.afterBody) {
        includes[kIncludeAfterBody] = includeFiles.afterBody;
      }
    }
    return includes;
  };

  return {
    type,
    data: type === "includes"
      ? dependenciesAsIncludes()
      : dependencies
      ? [dependencies]
      : [],
  };
}

async function markdownFromNotebook(file: string) {
  const decoder = new TextDecoder("utf-8");
  const nbContents = await Deno.readFile(file);
  const nb = JSON.parse(decoder.decode(nbContents));
  const cells = nb.cells as Array<{ cell_type: string; source: string[] }>;
  const markdown = cells.reduce((md, cell) => {
    if (["markdown", "raw"].includes(cell.cell_type)) {
      return md + "\n" + cell.source.join("");
    } else {
      return md;
    }
  }, "");
  return markdown;
}
