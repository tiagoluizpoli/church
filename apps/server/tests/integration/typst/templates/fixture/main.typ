// Render-service fixture: the payload arrives as data, never as markup.
#let d = if "payload" in sys.inputs { json(bytes(sys.inputs.payload)) } else { json(sys.inputs.payload_file) }
#set document(title: d.title)
#set page(width: 120mm, height: auto, margin: 8mm)
#set text(font: "Atkinson Hyperlegible", size: 11pt, lang: "pt")
#if "logo" in sys.inputs { image(sys.inputs.logo, width: 12mm) }
#text(weight: "bold", d.title)

#for name in d.names [#name \ ]
// A busy loop that outlives the timeout under test.
#for _ in range(d.at("spin", default: 0)) {}
#for _ in range(d.at("extraPages", default: 0)) { pagebreak(); [mais] }
