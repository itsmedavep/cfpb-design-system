# Self-Contained PR Preview Notes

## Why these changes are needed

The PR preview action publishes built files to a `pr-preview/<PR>` subfolder on
`gh-pages`. For previews to be fully self-contained, all internal links and
assets must resolve under that preview base URL. Any hard-coded references to
`/design-system/...` or `https://cfpb.github.io/design-system/...` bypass the
preview base URL and instead point to the live site. That leads to:

- Previews pulling production CSS/JS/images, which can mask PR changes.
- Mixed versions (preview HTML + live assets) causing unexpected behavior.
- A preview that is not fully isolated from production.

Using Jekyll's `relative_url` filter or `site.baseurl` ensures the same content
works both on the live site (`/design-system`) and within PR previews
(`/design-system/pr-preview/<PR>`).

## Source of truth for exact instances

The full per-file checklist of exact matches is captured here:

`/tmp/pr-preview-hardcoded-paths.txt`

This list includes every file containing `/design-system/` or
`cfpb.github.io/design-system` across `docs/`, `.github/`, and `packages/`,
excluding generated output under `docs/_site` and `packages/**/dist`.

## What should change (rules of thumb)

- **Jekyll site content/layouts/assets**: replace internal URLs with
  `{{ "/path" | relative_url }}` or `{{ site.baseurl }}/path`.
- **External references** (e.g., `github.com`, other domains): keep absolute.
- **Generated files** (`docs/dist/**`): do not edit directly; regenerate after
  source updates.

## Step-by-step plan

1) **Open the checklist**: start with `/tmp/pr-preview-hardcoded-paths.txt`.
2) **Classify each match**:
   - Internal site link/asset (update to `relative_url` or `site.baseurl`).
   - External link (leave as-is).
   - Generated file (skip; regenerate later).
3) **Update primary site sources**:
   - `docs/pages/**` and `docs/special-pages/**`
   - `docs/_layouts/**`
   - `docs/assets/css/**`
   - `docs/assets/js/admin/**`
4) **Regenerate built assets**:
   - Run the usual build steps so `docs/dist/**` reflects the changes.
5) **Verify preview behavior**:
   - Check that preview URLs resolve under
     `/design-system/pr-preview/<PR>` and do not reference the live site.

