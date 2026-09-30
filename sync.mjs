// Builds model-manifest.json = upstream T3 Code manifest + overrides.json.
//
// Merge rules:
// - currentModels: upstream slugs, then override slugs not already listed.
// - providers: override entries win. Models merge by slug field-by-field
//   (a `null` field deletes it, e.g. "badge": null), unknown slugs are added.
// Exits non-zero without writing when upstream is unreachable or changed
// format, so the last good manifest stays published.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const UPSTREAM_URL =
  "https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/provider/model-manifest.json";
const OUTPUT = "model-manifest.json";

const fail = (message) => {
  console.error(`sync failed: ${message}`);
  process.exit(1);
};

const response = await fetch(UPSTREAM_URL);
if (!response.ok) fail(`upstream returned HTTP ${response.status}`);
const upstream = await response.json();
if (upstream.version !== 1) fail(`unsupported upstream version ${upstream.version}`);
if (typeof upstream.currentModels !== "object") fail("upstream has no currentModels");

const overrides = JSON.parse(readFileSync("overrides.json", "utf8"));

const withoutNulls = (entry) =>
  Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null));

const currentModels = { ...upstream.currentModels };
for (const [provider, slugs] of Object.entries(overrides.currentModels ?? {})) {
  currentModels[provider] = [...new Set([...(currentModels[provider] ?? []), ...slugs])];
}

const providers = { ...upstream.providers };
for (const [provider, catalog] of Object.entries(overrides.providers ?? {})) {
  const base = providers[provider] ?? { profiles: {}, models: [] };
  const models = base.models.map((model) => {
    const override = catalog.models?.find((entry) => entry.slug === model.slug);
    return override ? withoutNulls({ ...model, ...override }) : model;
  });
  for (const override of catalog.models ?? []) {
    if (!models.some((model) => model.slug === override.slug)) {
      models.push(withoutNulls(override));
    }
  }
  const defaults = catalog.defaults ?? base.defaults;
  providers[provider] = {
    ...base,
    ...(defaults ? { defaults } : {}),
    profiles: { ...base.profiles, ...catalog.profiles },
    models,
  };
}

// The app rejects a manifest whose model slugs repeat or whose profile and
// default references dangle, so check that here instead of shipping it.
for (const [provider, catalog] of Object.entries(providers)) {
  const slugs = new Set();
  for (const model of catalog.models) {
    if (slugs.has(model.slug)) fail(`${provider}: duplicate slug ${model.slug}`);
    slugs.add(model.slug);
    if (model.profile && !catalog.profiles[model.profile]) {
      fail(`${provider}: ${model.slug} uses missing profile ${model.profile}`);
    }
  }
  if (catalog.defaults?.chat && !slugs.has(catalog.defaults.chat)) {
    fail(`${provider}: default ${catalog.defaults.chat} is not a listed model`);
  }
}

const { updatedAt: _upstreamUpdatedAt, ...rest } = upstream;
const body = { ...rest, currentModels, providers };

// Only bump updatedAt when the content changed, so unchanged runs commit nothing.
const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, "utf8")) : null;
const { updatedAt: previousUpdatedAt, ...previousBody } = previous ?? {};
const changed = JSON.stringify(previousBody) !== JSON.stringify(body);
const updatedAt = changed ? new Date().toISOString() : previousUpdatedAt;

const { version, ...afterVersion } = body;
writeFileSync(OUTPUT, `${JSON.stringify({ version, updatedAt, ...afterVersion }, null, 2)}\n`);
console.log(changed ? "manifest updated" : "manifest unchanged");
