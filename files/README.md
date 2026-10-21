# SpacyG Cosmic Graph (plugin) + SpacyG Cosmic (theme)

Install the theme: copy the `SpacyG-Cosmic` folder into `<vault>/.obsidian/themes/`, then pick it in Settings -> Appearance.
Install the plugin: copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/spacyg-cosmic-graph/`, enable it in Community plugins.

## What the plugin adds
- **Live sky.** The static stars behind Obsidian's own Graph view and Local graph now drift, twinkle, shy away from your pointer and
  throw the odd shooting star. (A theme is CSS only, so this needs the plugin.) Settings: on/off, pointer reaction, star density.
- **Cosmic Graph view** (ribbon orbit icon, or "Open Cosmic Graph"): every note is a star in 3D.
  - The stars **arrange themselves into a sphere**, evenly spaced. Add or delete notes and they glide to their new places.
  - **Grab a star and drag it**: the notes it links to are pulled after it, and theirs after them, like the default graph.
    Let go and everything springs back onto the sphere. Turn **Shape** off for free graph physics (nodes stay where you leave them).
  - Drag empty space to rotate, scroll/pinch to zoom, click a star to open the note, click a folder to focus it. **Globe** toggles the faint grid.

## Limits
- Obsidian's own Graph view can't be re-laid out by a theme or a normal plugin, so the sphere lives in the Cosmic Graph view.
- Tested in a browser with a stand-in for the Obsidian API, not inside Obsidian itself. Back up your vault first.
