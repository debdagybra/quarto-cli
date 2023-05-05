-- equations.lua
-- Copyright (C) 2020-2022 Posit Software, PBC

-- process all equations
function equations()
  return {
    Para = process_equations,
    Plain = process_equations
  }
end

function process_equations(blockEl)

  -- alias inlines
  local inlines = blockEl.content

  -- do nothing if there is no math herein
  if inlines:find_if(isDisplayMath) == nil then
    return blockEl
  end

  local mathInlines = nil
  local targetInlines = pandoc.List()

  for i, el in ipairs(inlines) do

    -- see if we need special handling for pending math, if
    -- we do then track whether we should still process the
    -- inline at the end of the loop
    local processInline = true
    if mathInlines then
      if el.t == "Space" then
        mathInlines:insert(el)
        processInline = false
      elseif el.t == "Str" and refLabel("eq", el) then

        -- add to the index
        local label = refLabel("eq", el)
        local order = indexNextOrder("eq")
        indexAddEntry(label, nil, order)

        -- get the equation
        local eq = mathInlines[1]

        -- write equation
        if _quarto.format.isLatexOutput() then
          targetInlines:insert(pandoc.RawInline("latex", "\\begin{equation}"))
          targetInlines:insert(pandoc.Span(pandoc.RawInline("latex", eq.text), pandoc.Attr(label)))
          targetInlines:insert(pandoc.RawInline("latex", "\\label{" .. label .. "}\\end{equation}"))
        elseif _quarto.format.isTypstOutput() then
          targetInlines:insert(pandoc.RawInline("typst", 
            "#set math.equation(numbering: \"(" .. inlinesToString(numberOption("eq", order)) .. ")\"); " ..
            "$ " .. eq.text .. " $ <" .. label .. "> #set math.equation(numbering: none)"
          ))
        else
          local eqNumber = eqQquad
          local mathMethod = param("html-math-method", nil)
          if _quarto.format.isHtmlOutput() and (mathMethod == "mathjax" or mathMethod == "katex") then
            eqNumber = eqTag
          end
          eq.text = eq.text .. " " .. eqNumber(inlinesToString(numberOption("eq", order)))
          local span = pandoc.Span(eq, pandoc.Attr(label))
          targetInlines:insert(span)
        end

        -- reset state
        mathInlines = nil
        processInline = false
      else
        targetInlines:extend(mathInlines)
        mathInlines = nil
      end
    end

    -- process the inline unless it was already taken care of above
    if processInline then
      if isDisplayMath(el) then
          mathInlines = pandoc.List()
          mathInlines:insert(el)
        else
          targetInlines:insert(el)
      end
    end

  end

  -- flush any pending math inlines
  if mathInlines then
    targetInlines:extend(mathInlines)
  end

  -- return the processed list
  blockEl.content = targetInlines
  return blockEl
 
end

function eqTag(eq)
  return "\\tag{" .. eq .. "}"
end

function eqQquad(eq)
  return "\\qquad(" .. eq .. ")"
end

function isDisplayMath(el)
  return el.t == "Math" and el.mathtype == "DisplayMath"
end
