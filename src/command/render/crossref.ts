/*
* crossref.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/
import { resourcePath } from "../../core/resources.ts";
import {
  kListings,
  kNumberDepth,
  kNumberOffset,
  kNumberSections,
  kShiftHeadingLevelBy,
  kTopLevelDivision,
} from "../../config/constants.ts";
import {
  FormatPandoc,
  isBeamerOutput,
  isLatexOutput,
} from "../../config/format.ts";
import { PandocFlags } from "../../config/flags.ts";
import { Metadata } from "../../config/metadata.ts";

import { PandocOptions } from "./pandoc.ts";

export function crossrefFilter() {
  return resourcePath("filters/crossref/crossref.lua");
}

export function crossrefFilterActive(options: PandocOptions) {
  return options.format.metadata.crossref !== false;
}

export function crossrefGeneratedDefaults(options: PandocOptions) {
  // if the chapters options is set and there is no explicit top-level-division
  // then set the top-level-division to chapters
  if (typeof options.format.metadata.crossref === "object") {
    const crossref = options.format.metadata.crossref as Record<
      string,
      unknown
    >;
    if (crossref.chapters) {
      const defaults: Record<string, unknown> = {};
      if (crossrefOption(kTopLevelDivision, options) === undefined) {
        defaults[kTopLevelDivision] = "chapter";
      }
      if (crossrefOption(kNumberSections, options) === undefined) {
        defaults[kNumberSections] = true;
      }
      return defaults;
    }
  }

  // pdfs with no other heading level oriented options get their heading level shifted by -1
  if (
    (isLatexOutput(options.format.pandoc) &&
      !isBeamerOutput(options.format.pandoc)) &&
    options.flags?.[kTopLevelDivision] === undefined &&
    options.format.pandoc?.[kTopLevelDivision] === undefined &&
    options.flags?.[kShiftHeadingLevelBy] === undefined &&
    options.format.pandoc?.[kShiftHeadingLevelBy] === undefined
  ) {
    return {
      [kShiftHeadingLevelBy]: -1,
    };
  }

  // return no defaults
  return undefined;
}

export function crossrefFilterParams(
  flags?: PandocFlags,
  defaults?: FormatPandoc,
  metadata?: Metadata,
) {
  const kCrossrefFilterParams = [kListings, kNumberSections, kNumberOffset];
  const params: Metadata = {};
  kCrossrefFilterParams.forEach((option) => {
    const value = crossrefOption(option, flags, defaults);
    if (value) {
      // validation
      if (option === kNumberOffset) {
        if (
          !Array.isArray(value) || value.some((num) => !Number.isInteger(num))
        ) {
          throw new Error(
            "Invalid value for number-offset (should be an array of numbers)",
          );
        }
      }

      params[option] = value;
    }
  });

  // Read the number depth
  params[kNumberDepth] = metadata?.[kNumberDepth];
  return params;
}

function crossrefOption(
  name: string,
  flags?: PandocFlags,
  defaults?: FormatPandoc,
) {
  if (flags && Object.keys(flags).includes(name)) {
    // deno-lint-ignore no-explicit-any
    return (flags as any)[name];
  } else if (Object.keys(defaults || {}).includes(name)) {
    // deno-lint-ignore no-explicit-any
    return (defaults as any)[name];
  } else {
    return undefined;
  }
}
