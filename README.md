# chatandcode-models

The model list ChatAndCode apps download to learn which models are current and which get a "new" badge.

`model-manifest.json` is generated. Don't edit it by hand. Every 6 hours a GitHub Action takes the upstream [T3 Code manifest](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/model-manifest.json), applies `overrides.json`, and commits the result if it changed. The same Action also runs when `overrides.json` changes, or from the Actions tab (**Run workflow**).

## Changing models

Edit `overrides.json`. It has the same shape as the manifest and only lists where ChatAndCode differs from upstream:

- `currentModels.<provider>`: extra slugs to treat as current.
- `providers.<provider>.models`: entries merged by `slug` on top of upstream's. Set a field to `null` to remove it, e.g. `"badge": null` hides upstream's "new" badge.

If upstream can't be fetched, or changes to a format the script doesn't know, the run fails and the last good manifest stays published.
