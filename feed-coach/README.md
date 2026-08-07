# Feed Coach

AI-powered YouTube feed assistant as a Tampermonkey userscript. It observes
the YouTube feed, extracts video metadata, sends batches to Google Gemini AI
Studio, and overlays relevance scores on thumbnails.

## Features

- **Observer-based** — uses `MutationObserver` + `IntersectionObserver` (no polling)
- **Event-driven** — modules communicate only through an event bus
- **Fail-open** — AI/network failures never break YouTube; videos are kept
- **Batched AI scoring** — videos are debounced and sent to Gemini in batches
- **SPA resilient** — observers reconnect after `yt-navigate-finish`

## Project Structure

```text
feed-coach/
├── src/
│   ├── bootstrap.js        # Entry point, wires all modules
│   ├── logger.js           # [FeedCoach]-prefixed logging
│   ├── events.js           # Event bus
│   ├── storage.js          # GM_getValue/GM_setValue wrapper
│   ├── observer.js         # FeedObserver (Mutation + Intersection)
│   ├── extractor.js        # Video metadata extraction
│   ├── queue.js            # QueueManager (debounce/batch/dedupe)
│   ├── decision.js         # DecisionEngine (KEEP/REJECT)
│   ├── overlay.js          # Score badges on thumbnails
│   ├── settings.js         # Settings persistence
│   ├── dashboard.js        # Statistics tracking
│   ├── utils.js            # Shared helpers
│   ├── platform/
│   │   └── youtube.js      # YouTube DOM adapter
│   └── ai/
│       ├── provider.js     # AIProvider interface
│       └── gemini.js       # GeminiProvider (official API)
├── build.js                # esbuild bundler
├── test/
│   └── smoke.test.js       # Headless smoke test
├── feed-coach.user.js      # Bundled output (install in Tampermonkey)
└── package.json
```

## Build

```bash
npm install
npm run build
```

This bundles all ES modules in `src/` into a single `feed-coach.user.js`
using esbuild. The output includes the Tampermonkey `==UserScript==` header.

## Test

```bash
npm test
```

Runs a headless smoke test that simulates the browser/Tampermonkey
environment and verifies bootstrap, observer, queue, Gemini endpoint, and
fail-open behavior.

## Install

1. Run `npm run build`.
2. Open Tampermonkey → Dashboard → Utilities → Import from file.
3. Select `feed-coach.user.js`.
4. Open YouTube and set your Gemini API key in the settings panel
   (`Ctrl + Shift + F`).

## Configuration

- **API Key**: Google Gemini AI Studio key (required for scoring).
- **Preferences**: free-form text describing what you want to see.
- **Threshold**: score cutoff for future "Not Interested" automation (Phase 3).
