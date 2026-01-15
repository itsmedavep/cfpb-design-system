# Style Dictionary refactor notes

Here is a straight‑talk summary of what changed and why.

## What changed

- The config now builds one CSS file per token JSON, and keeps all logic in a single file with compact helpers.
- Token names are kebab‑cased from the full path (using Style Dictionary’s built‑in `name/kebab`).
- Colors use Style Dictionary’s built-in `color/css`; RGBA-only inputs emit CSS v4 `rgba(r g b / a)` without rounding, and non-hex object inputs are normalized with a warning.
- CSS output keeps comma‑separated values tight (no spaces around commas), without touching comments.
- Aliases now stay as `var(--...)` even when the JSON uses Figma alias metadata instead of a direct `{ref}`, with collision detection.
- Alias collisions across collections warn; collisions without a collection name now throw.
- The `tokens` script uses the local Style Dictionary CLI to ensure custom transforms/formatters are actually registered.

## Why it was needed

- Your token JSON is DTCG‑style and sometimes stores aliases only in `com.figma.aliasData`. Style Dictionary won’t preserve aliases in CSS unless the value itself is a reference, so we added a targeted transform to respect the alias metadata.
- The original naming transform no longer fit the new flat token structure.
- The built‑in CSS formatter leaves spaces around commas, which your linter rejects.
- Manual token edits that use non-hex values still work; RGBA-only values pass through losslessly, while other non-hex object inputs are normalized by `color/css` with a warning.

## Where to look

- `style-dictionary.config.js` — compact helper structure, naming transform, color handling, alias preservation, and custom CSS formatter.
- `package.json` — `tokens` script now calls the local CLI.

## Current behavior notes

- DTCG `$type` drives transform selection (no CTI matching).
- `targetVariableSetName` is used only for alias collision detection and never appears in CSS custom property names.
- RGBA output is only emitted when the token has RGBA and no hex value; the RGBA floats are preserved.
