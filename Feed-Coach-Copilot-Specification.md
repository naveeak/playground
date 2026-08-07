# Feed Coach v1 --- Copilot Implementation Specification

## Overview

Build a **production-quality Tampermonkey userscript** called **Feed
Coach**.

The goal is to intelligently curate the YouTube recommendation feed by
sending video metadata to an AI provider (initially Google Gemini AI
Studio) and displaying AI recommendations. Automatic **"Not
Interested"** actions will be added in a later phase.

The implementation should follow a **modular, event-driven, clean
architecture** based on the supplied architecture document.

------------------------------------------------------------------------

# Technology Stack

-   Language: Modern JavaScript (ES2022)
-   Platform: Tampermonkey
-   Browsers: Chrome, Edge, Brave, Firefox
-   Dependencies: None
-   UI Frameworks: None
-   jQuery: Not allowed

------------------------------------------------------------------------

# Build Target

Final bundled output:

``` text
feed-coach.user.js
```

Development should use modular source files that are bundled into a
single userscript.

------------------------------------------------------------------------

# Project Structure

``` text
feed-coach/
├── src/
│   ├── bootstrap.js
│   ├── config.js
│   ├── logger.js
│   ├── events.js
│   ├── storage.js
│   ├── observer.js
│   ├── extractor.js
│   ├── queue.js
│   ├── decision.js
│   ├── overlay.js
│   ├── settings.js
│   ├── dashboard.js
│   ├── utils.js
│   ├── platform/
│   │   └── youtube.js
│   └── ai/
│       ├── provider.js
│       └── gemini.js
├── build.js
├── feed-coach.user.js
└── README.md
```

------------------------------------------------------------------------

# Architecture Principles

-   Modular
-   Event-driven
-   Fail-open
-   Dependency injection where practical
-   Observer-based (no polling)
-   Minimal DOM access
-   Extensible
-   Maintainable
-   Strong logging

------------------------------------------------------------------------

# Core Modules

## Bootstrap

Initializes: - Storage - Logger - Event Bus - Queue - AI Provider -
Overlay - Feed Observer - Keyboard shortcuts

Expose:

``` js
bootstrap();
```

------------------------------------------------------------------------

## Logger

Methods

``` js
Logger.debug()
Logger.info()
Logger.warn()
Logger.error()
```

Prefix all logs with:

``` text
[FeedCoach]
```

------------------------------------------------------------------------

## Event Bus

API

``` js
bus.on(event, handler)
bus.off(event, handler)
bus.emit(event, payload)
```

Events

-   VIDEO_FOUND
-   VIDEO_READY
-   QUEUE_UPDATED
-   BATCH_READY
-   AI_REQUEST_STARTED
-   AI_REQUEST_SUCCESS
-   AI_REQUEST_FAILED
-   VIDEO_SCORED
-   OVERLAY_UPDATED
-   SETTINGS_CHANGED
-   ERROR

Modules communicate only through events.

------------------------------------------------------------------------

## Storage

Wrap:

-   GM_getValue
-   GM_setValue

API

``` js
storage.get(key)
storage.set(key, value)
storage.remove(key)
```

Persist:

-   API Key
-   Preferences
-   Statistics
-   Theme
-   Logs
-   Threshold
-   Provider
-   Prompt
-   Processed IDs

------------------------------------------------------------------------

## Feed Observer

Use:

-   MutationObserver
-   IntersectionObserver

Observe:

-   Home
-   Watch
-   Search
-   Subscriptions
-   Explore

Selectors:

-   ytd-rich-item-renderer
-   ytd-video-renderer
-   ytd-grid-video-renderer
-   ytd-compact-video-renderer

Deduplicate by `videoId`.

------------------------------------------------------------------------

## Metadata Extractor

Return:

``` js
{
  videoId,
  title,
  channel,
  duration,
  durationSeconds,
  thumbnail,
  url,
  views,
  published,
  sourcePage,
  element
}
```

------------------------------------------------------------------------

## Queue Manager

Responsibilities:

-   Debounce (500ms)
-   Batch (10 videos)
-   Deduplicate
-   Rate limit
-   Prioritize visible videos

Maximum queue: 100

------------------------------------------------------------------------

## AI Provider Interface

``` js
class AIProvider {
  async scoreVideos(videos, preferences) {}
}
```

Implement:

-   GeminiProvider

Future:

-   OpenAI
-   OpenRouter
-   Ollama
-   LM Studio

------------------------------------------------------------------------

## Gemini Provider

Model:

-   gemini-2.5-flash

Use:

-   responseMimeType = application/json
-   temperature = 0
-   timeout = 10 seconds

Prompt must request **JSON only**.

Implement retry logic.

------------------------------------------------------------------------

## Prompt Builder

Input:

-   User preferences
-   Video metadata

Output:

Strict JSON.

No markdown. No explanations.

------------------------------------------------------------------------

## Decision Engine

Receives AI scores.

Emit:

-   KEEP
-   REJECT

MVP: No automatic clicking.

------------------------------------------------------------------------

## Overlay Engine

Show badge:

``` text
🟢 9.4
Excellent Spark tutorial
```

or

``` text
🔴 2.1
Celebrity gossip
```

Top-right of thumbnail.

------------------------------------------------------------------------

## Settings Panel

Shortcut:

``` text
Ctrl + Shift + F
```

Sections:

-   General
-   AI
-   Prompt
-   Threshold
-   Statistics
-   Logs

Buttons:

-   Save
-   Reset
-   Export
-   Import
-   Test API

------------------------------------------------------------------------

## Dashboard

Display:

-   Videos Seen
-   Videos Scored
-   Queue Size
-   API Calls
-   Errors
-   Latency
-   Provider
-   API Health

------------------------------------------------------------------------

## Lifecycle

Support:

-   yt-navigate-finish
-   visibilitychange
-   pageshow
-   pagehide
-   beforeunload

Reconnect observers after SPA navigation.

------------------------------------------------------------------------

## Error Handling

Fail-open.

If AI fails:

-   Keep video
-   Retry
-   Log
-   Continue

Malformed JSON must not break execution.

------------------------------------------------------------------------

## Performance

Requirements:

-   MutationObserver
-   IntersectionObserver
-   WeakMap
-   Set for processed IDs
-   Batched DOM updates
-   requestIdleCallback when available

No polling.

------------------------------------------------------------------------

## Coding Standards

-   ES2022
-   async/await
-   const by default
-   JSDoc for public APIs
-   Guard clauses
-   Early returns
-   No anonymous functions unless trivial
-   Descriptive names

------------------------------------------------------------------------

## Debug Logging

Example:

``` text
[FeedCoach]
Observer Started
Video Found
Queue Updated
Batch Ready
Gemini Request
Overlay Added
```

------------------------------------------------------------------------

## Testing Checklist

-   No duplicate processing
-   Infinite scroll works
-   SPA navigation works
-   Returning from watch page works
-   Queue batching works
-   Invalid API key handled
-   Network failures handled
-   Malformed AI responses handled
-   Overlay cleanup works
-   No memory leaks

------------------------------------------------------------------------

## Future Roadmap

### Phase 1

-   Foundation
-   Observer
-   Metadata
-   Queue
-   Gemini integration
-   Overlay

### Phase 2

-   Dashboard
-   Settings
-   Statistics

### Phase 3

-   Human-like "Not Interested"
-   Rule engine
-   Learning mode

### Phase 4

-   Reddit
-   LinkedIn
-   Hacker News
-   GitHub Explore
-   Medium

Only platform adapters should change; the AI pipeline should remain
reusable.
