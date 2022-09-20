-- figures.lua
-- Copyright (C) 2020 by RStudio, PBC


function figures() 
  
  return {
   
    ---@param el pandoc.Div
    Div = function(el)
      
      -- propagate fig-cap on figure div to figure caption 
      if hasFigureRef(el) then
        local figCap = attribute(el, kFigCap, nil)
        if figCap ~= nil then
          local caption = pandoc.Para(markdownToInlines(figCap))
          el.content:insert(caption)
          el.attr.attributes[kFigCap] = nil
        end
      end
      return el
      
    end,
    
    -- create figure divs from linked figures
    ---@param el pandoc.Para
    Para = function(el)
      
      -- create figure div if there is a tikz image
      local fig = discoverFigure(el)
      if fig and latexIsTikzImage(fig) then
        return createFigureDiv(el, fig)
      end
      
      -- create figure divs from linked figures
      local linkedFig = discoverLinkedFigure(el)
      if linkedFig then
        return createFigureDiv(el, linkedFig)
      end

    end,

    ---@param image pandoc.Image
    Image = function(image)
      -- propagate fig-alt
      if _quarto.format.isHtmlOutput() then
        -- read the fig-alt text and set the image alt
        local altText = attribute(image, kFigAlt, nil);
        if altText ~= nil then
          image.attr.attributes["alt"] = altText
          image.attr.attributes[kFigAlt] = nil
          return image
        end
      -- provide default fig-pos or fig-env if specified
      elseif _quarto.format.isLatexOutput() then
        local figPos = param(kFigPos)
        if figPos and not image.attr.attributes[kFigPos] then
          image.attr.attributes[kFigPos] = figPos
        end
        local figEnv = param(kFigEnv)
        if figEnv and not image.attr.attributes[kFigEnv] then
          image.attr.attributes[kFigEnv] = figPos
        end
      else 
        return image
      end
    end
  }
end



