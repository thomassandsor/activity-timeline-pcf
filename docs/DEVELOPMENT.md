# Development

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [.NET SDK](https://dotnet.microsoft.com/download) 8 or later (builds the solution)
- Optional: [Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction) (`pac`) to push
  a build straight into a development environment

## Layout

```
src/ActivityTimeline/            The PCF control (React virtual control, Fluent UI v9)
  ActivityTimeline/
    index.ts                     Entry point: reads the configuration and record, picks the data source
    model/                       Pure logic: configuration, dates (user's Dataverse time zone), HTML handling,
                                 feed grouping and threading, activity type defaults, strings
    data/DataverseDataSource.ts  Web API queries, mapping, actions, navigation
    data/SampleDataSource.ts     Sample data for the local test harness (left out of production builds)
    data/dataSource.ts           Data source contract, MergedPager (merges paged queries in date order) and
                                 HydratingPager (loads bodies and participants for shown items only)
    ui/                          React components
    strings/                     Generated resx files: English (1033), Norwegian Bokmål (1044), Swedish (1053), Danish (1030)
  scripts/strings.mjs            Every text in the control, in all languages
solution/                        Solution project; a Release build makes the managed and unmanaged zips
scripts/resx.mjs                 Writes the resx files from a string table
```

## Run it locally

```powershell
cd src/ActivityTimeline
npm ci
npm start watch      # test harness with sample data and live reload
npm run lint
```

The test harness has no Dataverse, so it shows built-in sample data. It also only loads the last language file in
the manifest, so its texts appear in Danish.

To try it in a real environment, push a development build into your own environment's solution:

```powershell
pac auth create --environment https://yourorg.crm.dynamics.com/
pac pcf push --solution-unique-name YourDevSolution
```

## Build the solution

```powershell
cd solution
dotnet build -c Release
```

The output in `solution/bin/Release/` is `ActivityTimeline.zip` (unmanaged) and `ActivityTimeline_managed.zip`
(managed).

## Texts and languages

Every text lives in one table in `src/ActivityTimeline/scripts/strings.mjs`. Each row is
`[English, Norwegian, Swedish, Danish]`; keys starting with a capital letter are shown to makers in the form designer, the
rest to users. After editing, run:

```powershell
npm run strings
```

This regenerates `strings/*.resx` and `model/strings.ts`; don't edit those by hand. The run fails if a language
is missing a text or a translation drops a `{0}` placeholder.

To add a language:
1. Add it to `LANGUAGES` in `scripts/resx.mjs`.
2. Add a column to every row in `strings.mjs`.
3. Add a `<resx>` line to `ControlManifest.Input.xml`.
4. Add the locale to `LANGUAGE_LOCALES` in `model/dates.ts` if it's missing.

## How it works

Queries per load:

1. **Counts**: three FetchXML aggregates (activities per type and state, overdue per type, notes). The participant
   check uses `link-type="any"`, so an activity with several matching parties is counted once. FetchXML returns
   types as object type codes; system codes are built in, custom ones come from metadata. The counts also tell the
   feed which queries it can skip.
2. **Feed**: per kind of date (created, start, due, completed), a paged light `activitypointer` query, plus a paged
   `annotation` query. `MergedPager` merges them in date order. Filters and search run in Dataverse, so paging
   stays correct.
3. **Details** for the shown items: `activitypointer` by id with `activitypointer_activity_parties` expanded
   (25 per query), `activitymimeattachment` ids for attachment counts, and status labels from metadata.
4. **Preview**: one `retrieveRecord` for the configured columns, plus attachment metadata. File bodies load only
   for image previews (up to 3 MB) and downloads.

If an environment rejects the participant filter, the control falls back to regarding-only automatically.

Security: email and rich-text bodies render in an iframe without `allow-scripts`, with a Content Security Policy
that blocks everything except inline styles and, when allowed, images.

Theming: Fluent UI v9 tokens from `context.fluentDesignLanguage`, so the control follows the app's theme. React,
React DOM and Fluent are platform libraries; the production bundle is about 150 KB.

Platform library versions: the manifest asks for React 16.14.0 and Fluent 9.46.2, the highest Fluent 9 version
Dataverse accepts in a manifest at the time of writing (the app loads a newer 9.x at runtime).

Build note: `@fluentui/react-icons` isn't a platform library. `webpack.config.js` (enabled by `featureconfig.json`)
routes its Griffel import to the platform's Fluent so there's a single style engine.

## Release

1. Bump the version in `src/ActivityTimeline/ActivityTimeline/ControlManifest.Input.xml` (`version="x.y.z"`) and in
   `solution/src/Other/Solution.xml` (`<Version>x.y.z</Version>`). Dataverse only replaces a control whose version
   went up.
2. Build the solution (see above) and commit.
3. Tag, push and publish the release with both zips attached:

   ```powershell
   git tag vx.y.z
   git push origin main --tags
   gh release create vx.y.z solution/bin/Release/ActivityTimeline.zip solution/bin/Release/ActivityTimeline_managed.zip --title "Activity Timeline vx.y.z" --generate-notes
   ```
