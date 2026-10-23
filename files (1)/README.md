# SpacyG Cosmic Graph (plugin) + SpacyG Cosmic (theme)

Install the theme: copy the `SpacyG-Cosmic` folder into `<vault>/.obsidian/themes/`, then pick it in Settings -> Appearance.
Install the plugin: copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/spacyg-cosmic-graph/`, enable it in Community plugins.
If you are updating, replace the old files and reload Obsidian.

## What the plugin adds
- **Live sky.** The static stars behind Obsidian's own Graph view and Local graph drift, twinkle, shy away from your pointer and
  throw the odd shooting star. Settings: on/off, pointer reaction, star density.
- **Cosmic Graph view** (ribbon orbit icon, or "Open Cosmic Graph"): every note is a star in 3D.
  - Default layout: an **icosahedron**. With too few notes you get an unfinished one (a cap of triangles grows from the top).
    Past 12 notes, stars sit on the edges, then spikes grow outward from the edges, then longer shells of spikes.
  - The **Layout** button switches to an evenly spaced **sphere** and back (your choice is remembered).
  - **Grab a star and drag it**: the notes it links to are pulled after it, and theirs after them, like the default graph.
    Let go and everything springs back onto the shape. Turn **Shape** off for free graph physics.
  - Drag empty space to rotate, scroll/pinch to zoom, click a star to open the note, click a folder to focus it.

## Limits
- Obsidian's own Graph view can't be re-laid out by a theme or a normal plugin, so the shapes live in the Cosmic Graph view.
- Tested in a browser with a stand-in for the Obsidian API, not inside Obsidian itself. Back up your vault first.
