-- panel-input.lua
-- Copyright (C) 2021 by RStudio, PBC

function panelInput() 

  return {
    ---@param el pandoc.Div
    Div = function(el)
      if hasBootstrap() and el.attr.classes:find("panel-input") then
        tappend(el.attr.classes, {
          "card",
          "bg-light",
          "p-2",
        })
      end
      return el
    end
  }


end

