return {
  -- returns a placeholder data URI image of the specified size
  ['placeholder'] = function(args, kwargs, meta)
    local width = args[1] or "100"
    local height = args[2] or width
    local size_str = tostring(width) .. " x " .. tostring(height)
    local svg_open = "<svg width = \"" .. width .. "\" height = \"" .. height .. "\" xmlns = \"http://www.w3.org/2000/svg\" viewBox = \"0 0 " .. width .. " " .. height .. "\">"
    local svg_close = "</svg>"
    local rect = "<rect width = \"" .. width .. "\" height = \"" .. height .. "\" fill = \"#ddd\" />"
    local font_size = math.floor(0.1 * math.min(tonumber(width) or 100, tonumber(height) or 100))
    local text = "<text x = \"50%\" y = \"50%\" font-family = \"sans-serif\" font-size = \"" .. tostring(font_size) .. "\" fill = \"#000\" text-anchor = \"middle\">" .. size_str .. "</text>"
    local svg = svg_open .. rect .. text .. svg_close
    local svg64 = "data:image/svg+xml;base64," .. quarto.base64.encode(svg)
    local result

    if kwargs["format"] == "svg" then
      result = svg64
    else
      local mt, contents = pandoc.mediabag.fetch("https://svg2png.deno.dev/" .. svg64)
      result = "data:" .. mt .. ";base64," .. quarto.base64.encode(contents)
    end

    return pandoc.Image({}, result)
  end
}
