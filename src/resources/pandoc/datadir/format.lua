
-- does the table contain a value
local function tcontains(t,value)
  if t and type(t)=="table" and value then
    for _, v in ipairs (t) do
      if v == value then
        return true
      end
    end
    return false
  end
  return false
end


-- check for latex output
local function isLatexOutput()
  return FORMAT == "latex" or FORMAT == "beamer" or FORMAT == "pdf"
end

local function isBeamerOutput()
  return FORMAT == "beamer"
end

-- check for docx output
local function isDocxOutput()
  return FORMAT == "docx"
end

-- check for rtf output
local function isRtfOutput()
  return FORMAT == "rtf"
end

-- check for odt output
local function isOdtOutput()
  return FORMAT == "odt" or FORMAT == "opendocument"
end

-- check for word processor output
local function isWordProcessorOutput()
  return FORMAT == "docx" or FORMAT == "rtf" or isOdtOutput()
end

-- check for powerpoint output
local function isPowerPointOutput()
  return FORMAT == "pptx"
end

-- check for revealjs output
local function isRevealJsOutput()
  return FORMAT == "revealjs"
end

-- check for slide output
local function isSlideOutput()
  return isHtmlSlideOutput() or isBeamerOutput() or isPowerPointOutput()
end

-- check for epub output
local function isEpubOutput()
  local formats = {
    "epub",
    "epub2",
    "epub3"
  }
  return tcontains(formats, FORMAT)
end

-- check for markdown output
local function isMarkdownOutput()
  local formats = {
    "markdown",
    "markdown_github",
    "markdown_mmd", 
    "markdown_phpextra",
    "markdown_strict",
    "gfm",
    "commonmark",
    "commonmark_x",
    "markua"
  }
  return tcontains(formats, FORMAT)
end

-- check for markdown with raw_html enabled
local function isMarkdownWithHtmlOutput()
  return isMarkdownOutput() and tcontains(PANDOC_WRITER_OPTIONS.extensions, "raw_html")
end

-- check for ipynb output
local function isIpynbOutput()
  return FORMAT == "ipynb"
end

local function isHtmlSlideOutput()
  local formats = {
    "s5",
    "dzslides",
    "slidy",
    "slideous",
    "revealjs",
  }
  return tcontains(formats, FORMAT)
end

-- check for html output
local function isHtmlOutput()
  local formats = {
    "html",
    "html4",
    "html5",
    "epub",
    "epub2",
    "epub3"
  }
  return tcontains(formats, FORMAT) or isHtmlSlideOutput()
end

-- we have some special rules to allow formats to behave more intuitively
local function isFormat(to)
  if FORMAT == to then
    return true
  else
    -- latex and pdf are synonyms
    if to == "latex" or to == "pdf" then
      return isLatexOutput()
    -- odt and opendocument are synonyms
    elseif to == "odt" or to == "opendocument" then
      return isOdtOutput()
    -- epub: epub, epub2, or epub3
    elseif to:match 'epub' then 
      return isEpubOutput()
    -- html: html, html4, html4, epub*, or slides (e.g. revealjs)
    elseif to == "html" then
      return isHtmlOutput()
    -- markdown: markdown*, commonmark*, gfm, markua
    elseif to == "markdown" then
      return isMarkdownOutput()
    else
      return false
    end 
  end
end


return {
  formatMatches = formatMatches,
  isLatexOutput = isLatexOutput,
  isBeamerOutput = isBeamerOutput,
  isDocxOutput = isDocxOutput,
  isRtfOutput = isRtfOutput,
  isOdtOutput = isOdtOutput,
  isWordProcessorOutput = isWordProcessorOutput,
  isPowerPointOutput = isPowerPointOutput,
  isRevealJsOutput = isRevealJsOutput,
  isSlideOutput = isSlideOutput,
  isEpubOutput = isEpubOutput,
  isMarkdownOutput = isMarkdownOutput,
  isMarkdownWithHtmlOutput = isMarkdownWithHtmlOutput,
  isIpynbOutput = isIpynbOutput, 
  isHtmlOutput = isHtmlOutput, 
  isHtmlSlideOutput = isHtmlSlideOutput
}