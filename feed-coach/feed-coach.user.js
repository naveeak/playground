// ==UserScript==
// @name         Feed Coach
// @namespace    https://example.com/feed-coach
// @version      0.1.0
// @description  AI-powered YouTube feed assistant
// @author       Feed Coach
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==
(() => {
  // src/logger.js
  var Logger = class {
    constructor(prefix = "[FeedCoach]") {
      this.prefix = prefix;
    }
    debug(...args) {
      console.debug(this.prefix, ...args);
    }
    info(...args) {
      console.info(this.prefix, ...args);
    }
    warn(...args) {
      console.warn(this.prefix, ...args);
    }
    error(...args) {
      console.error(this.prefix, ...args);
    }
  };

  // src/events.js
  var EventBus = class {
    constructor() {
      this.listeners = /* @__PURE__ */ new Map();
    }
    on(event, handler) {
      const handlers = this.listeners.get(event) ?? [];
      handlers.push(handler);
      this.listeners.set(event, handlers);
    }
    off(event, handler) {
      const handlers = this.listeners.get(event);
      if (!handlers) {
        return;
      }
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.listeners.delete(event);
      }
    }
    emit(event, payload) {
      const handlers = this.listeners.get(event);
      if (!handlers) {
        return;
      }
      handlers.slice().forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error("[FeedCoach] Event handler failed", event, error);
        }
      });
    }
  };

  // src/storage.js
  var Storage = class {
    constructor({ logger }) {
      this.logger = logger;
    }
    async initialize() {
      this.logger.debug("Storage initialized");
    }
    async get(key, defaultValue = null) {
      try {
        const value = await GM_getValue(key);
        return value === void 0 ? defaultValue : value;
      } catch (error) {
        this.logger.warn("Storage.get failed", key, error);
        return defaultValue;
      }
    }
    async set(key, value) {
      try {
        await GM_setValue(key, value);
      } catch (error) {
        this.logger.warn("Storage.set failed", key, error);
      }
    }
    async remove(key) {
      try {
        await GM_deleteValue(key);
      } catch (error) {
        this.logger.warn("Storage.remove failed", key, error);
      }
    }
  };

  // src/queue.js
  var MAX_QUEUE_SIZE = 100;
  var QueueManager = class {
    constructor({ bus, logger, storage, batchSize, debounceMs }) {
      this.bus = bus;
      this.logger = logger;
      this.storage = storage;
      this.batchSize = batchSize;
      this.debounceMs = debounceMs;
      this.queue = [];
      this.videoIds = /* @__PURE__ */ new Set();
      this.debounceTimer = null;
      this.processing = false;
      this.handleVideoReady = this.handleVideoReady.bind(this);
      this.handleBatchComplete = this.handleBatchComplete.bind(this);
    }
    async initialize() {
      this.bus.on("VIDEO_READY", this.handleVideoReady);
      this.bus.on("BATCH_COMPLETE", this.handleBatchComplete);
      this.logger.info("Queue initialized");
    }
    handleVideoReady(metadata) {
      if (!metadata || !metadata.videoId) {
        return;
      }
      if (this.videoIds.has(metadata.videoId)) {
        return;
      }
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        this.logger.warn("Queue full, dropping video", metadata.videoId);
        return;
      }
      this.queue.push(metadata);
      this.videoIds.add(metadata.videoId);
      this.logger.debug("Queue updated", this.queue.length);
      this.bus.emit("QUEUE_UPDATED", { queueSize: this.queue.length });
      this.scheduleBatch();
    }
    scheduleBatch() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => this.emitBatch(), this.debounceMs);
    }
    emitBatch() {
      this.debounceTimer = null;
      if (this.processing || this.queue.length === 0) {
        return;
      }
      const batch = this.queue.splice(0, this.batchSize);
      this.processing = true;
      this.logger.info("Batch ready", batch.length);
      this.bus.emit("BATCH_READY", batch);
    }
    /**
     * Called by the AI provider when a batch has been fully handled. Releases
     * the processing lock and schedules the next batch if more videos remain.
     */
    handleBatchComplete() {
      this.processing = false;
      if (this.queue.length > 0) {
        this.scheduleBatch();
      }
    }
  };

  // src/decision.js
  var DecisionEngine = class {
    constructor({ bus, logger }) {
      this.bus = bus;
      this.logger = logger;
      this.handleVideoScored = this.handleVideoScored.bind(this);
    }
    async initialize() {
      this.bus.on("VIDEO_SCORED", this.handleVideoScored);
      this.logger.info("Decision engine initialized");
    }
    handleVideoScored(scores) {
      if (!Array.isArray(scores)) {
        return;
      }
      scores.forEach((item) => {
        this.bus.emit("DECISION", {
          videoId: item.videoId,
          score: item.score,
          decision: item.decision
        });
        this.logger.debug("Video scored", item.videoId, item.score, item.decision);
      });
    }
  };

  // src/extractor.js
  function extractVideoMetadata(element, platform) {
    if (!element) {
      return null;
    }
    const videoId = platform?.getVideoId(element) || extractVideoIdFromElement(element);
    if (!videoId) {
      return null;
    }
    const title = platform?.getTitle(element) || extractText(element, "a#video-title") || extractText(element, "h3");
    const channel = platform?.getChannel(element) || extractText(element, "a.yt-simple-endpoint") || extractText(element, "#channel-name");
    const thumbnail = platform?.getThumbnail(element) || extractThumbnail(element);
    const url = platform?.getUrl(element) || extractUrl(element);
    const duration = platform?.getDuration(element) || extractText(element, "span.ytd-thumbnail-overlay-time-status-renderer");
    const durationSeconds = parseDuration(duration);
    const views = platform?.getViews(element) || extractText(element, "#metadata-line span:nth-child(1)") || null;
    const published = platform?.getPublished(element) || extractText(element, "#metadata-line span:nth-child(2)") || null;
    const sourcePage = window.location.href;
    return {
      videoId,
      title: title?.trim() || "",
      channel: channel?.trim() || "",
      duration: duration?.trim() || "",
      durationSeconds,
      thumbnail,
      url,
      views: views?.trim() || "",
      published: published?.trim() || "",
      sourcePage,
      element
    };
  }
  function extractText(element, selector) {
    const node = element.querySelector(selector);
    return node?.textContent?.trim() || null;
  }
  function extractUrl(element) {
    const anchor = element.querySelector('a#thumbnail, a[href*="watch?v="]');
    return anchor?.href || window.location.href;
  }
  function extractThumbnail(element) {
    const img = element.querySelector("img");
    if (img?.src) {
      return img.src;
    }
    const bg = element.querySelector('[style*="background-image"]');
    if (!bg) {
      return null;
    }
    const match = bg.style.backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
    return match ? match[2] : null;
  }
  function extractVideoIdFromElement(element) {
    const url = extractUrl(element);
    if (!url) {
      return null;
    }
    const match = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  }
  function parseDuration(durationText) {
    if (!durationText) {
      return 0;
    }
    const normalized = durationText.trim();
    const parts = normalized.split(":").map(Number);
    if (parts.some(Number.isNaN)) {
      return 0;
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 1) {
      return parts[0];
    }
    return 0;
  }

  // src/utils.js
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function safeParseJson(value, defaultValue = null) {
    if (typeof value !== "string") {
      return defaultValue;
    }
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
  function onIdle(callback, timeoutMs = 2e3) {
    if (typeof requestIdleCallback === "function") {
      return requestIdleCallback(callback, { timeout: timeoutMs });
    }
    return setTimeout(callback, 1);
  }
  function cancelIdle(handle) {
    if (typeof cancelIdleCallback === "function") {
      cancelIdleCallback(handle);
    } else {
      clearTimeout(handle);
    }
  }

  // src/observer.js
  var SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer"
  ];
  var OBSERVE_ROOT = "#contents, #primary, ytd-browse, ytd-watch-flexy, ytd-search";
  var FeedObserver = class {
    constructor({ bus, logger, platform }) {
      this.bus = bus;
      this.logger = logger;
      this.platform = platform;
      this.processedIds = /* @__PURE__ */ new Set();
      this.mutationObserver = null;
      this.intersectionObserver = null;
      this.videoElements = /* @__PURE__ */ new WeakMap();
      this.idleHandle = null;
      this.pendingElements = /* @__PURE__ */ new Set();
      this.boundOnNavigation = this.onNavigation.bind(this);
      this.boundOnVisibilityChange = this.onVisibilityChange.bind(this);
      this.boundOnPageHide = this.onPageHide.bind(this);
    }
    async initialize() {
      this.logger.info("Observer initialized");
      this.startObservers();
      window.addEventListener("yt-navigate-finish", this.boundOnNavigation);
      document.addEventListener("visibilitychange", this.boundOnVisibilityChange);
      window.addEventListener("pageshow", this.boundOnNavigation);
      window.addEventListener("pagehide", this.boundOnPageHide);
    }
    startObservers() {
      this.stopObservers();
      this.intersectionObserver = new IntersectionObserver(
        (entries) => this.handleIntersections(entries),
        { threshold: 0.25, rootMargin: "200px 0px 200px 0px" }
      );
      this.mutationObserver = new MutationObserver((mutations) => this.handleMutations(mutations));
      const root = this.findObserveRoot();
      this.mutationObserver.observe(root, {
        subtree: true,
        childList: true
      });
      this.scanExisting();
      this.logger.info("Observer started");
    }
    findObserveRoot() {
      for (const selector of OBSERVE_ROOT.split(",")) {
        const el = document.querySelector(selector.trim());
        if (el) {
          return el;
        }
      }
      return document.body;
    }
    stopObservers() {
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
        this.intersectionObserver = null;
      }
      if (this.idleHandle !== null) {
        cancelIdle(this.idleHandle);
        this.idleHandle = null;
      }
    }
    onNavigation() {
      this.logger.info("Navigation detected");
      this.startObservers();
    }
    onVisibilityChange() {
      if (document.visibilityState === "visible") {
        this.logger.info("Visibility restored");
        this.startObservers();
      }
    }
    onPageHide() {
      this.logger.info("Page hidden");
      this.stopObservers();
    }
    scanExisting() {
      SELECTORS.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => this.registerElement(element));
      });
    }
    handleMutations(mutations) {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          if (node.matches(SELECTORS.join(","))) {
            this.pendingElements.add(node);
          }
          node.querySelectorAll(SELECTORS.join(",")).forEach((element) => this.pendingElements.add(element));
        }
      }
      if (this.pendingElements.size > 0 && this.idleHandle === null) {
        this.idleHandle = onIdle(() => {
          this.idleHandle = null;
          this.flushPending();
        });
      }
    }
    flushPending() {
      for (const element of this.pendingElements) {
        this.registerElement(element);
      }
      this.pendingElements.clear();
    }
    handleIntersections(entries) {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const element = entry.target;
        const metadata = this.videoElements.get(element);
        if (!metadata) {
          continue;
        }
        this.logger.debug("Video ready", metadata.videoId);
        this.bus.emit("VIDEO_READY", metadata);
      }
    }
    registerElement(element) {
      if (!element || !element.isConnected) {
        return;
      }
      const metadata = extractVideoMetadata(element, this.platform);
      if (!metadata || !metadata.videoId) {
        return;
      }
      if (this.processedIds.has(metadata.videoId)) {
        return;
      }
      this.processedIds.add(metadata.videoId);
      this.videoElements.set(element, metadata);
      this.intersectionObserver?.observe(element);
      this.logger.debug("Video found", metadata.videoId);
      this.bus.emit("VIDEO_FOUND", metadata);
    }
  };

  // src/ai/provider.js
  var AIProvider = class {
    async scoreVideos(videos, preferences) {
      throw new Error("scoreVideos not implemented");
    }
  };

  // src/ai/gemini.js
  var DEFAULT_MODEL = "gemini-2.5-flash";
  var DEFAULT_TIMEOUT_MS = 1e4;
  var MAX_RETRIES = 3;
  var BASE_RETRY_DELAY_MS = 1e3;
  var GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
  var GeminiProvider = class extends AIProvider {
    constructor({ logger, storage, bus }) {
      super();
      this.logger = logger;
      this.storage = storage;
      this.bus = bus;
      this.apiKey = null;
    }
    async initialize() {
      this.apiKey = await this.storage.get("apiKey", "");
      this.bus.on("BATCH_READY", (batch) => this.handleBatch(batch));
      this.logger.info("GeminiProvider initialized");
    }
    async handleBatch(batch) {
      if (!Array.isArray(batch) || batch.length === 0) {
        return;
      }
      this.bus.emit("AI_REQUEST_STARTED", { count: batch.length });
      const preferences = await this.storage.get("preferences", {});
      const startedAt = performance.now();
      try {
        const scores = await this.scoreVideos(batch, preferences);
        const latencyMs = Math.round(performance.now() - startedAt);
        this.bus.emit("AI_REQUEST_SUCCESS", { count: batch.length, latencyMs });
        this.bus.emit("VIDEO_SCORED", scores);
      } catch (error) {
        this.logger.warn("Gemini request failed, keeping videos", error);
        this.bus.emit("AI_REQUEST_FAILED", { error, count: batch.length });
        const fallback = batch.map((video) => ({
          videoId: video.videoId,
          score: 0,
          decision: "KEEP"
        }));
        this.bus.emit("VIDEO_SCORED", fallback);
      } finally {
        this.bus.emit("BATCH_COMPLETE", { count: batch.length });
      }
    }
    async scoreVideos(videos, preferences) {
      const prompt = this.buildPrompt(videos, preferences);
      let lastError = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          const response = await this.sendRequest(prompt);
          return this.parseResponse(response, videos);
        } catch (error) {
          lastError = error;
          if (attempt === MAX_RETRIES) {
            break;
          }
          const backoff = BASE_RETRY_DELAY_MS * 2 ** attempt;
          this.logger.warn("Retrying Gemini request", { attempt: attempt + 1, backoff, error });
          await delay(backoff);
        }
      }
      throw lastError;
    }
    buildPrompt(videos, preferences) {
      const instructions = [
        "You are an assistant that scores YouTube feed videos for relevance based on the user preferences.",
        "Return JSON only with no markdown, no explanation, and no additional keys.",
        'Provide an object with a key "videos" containing an array of objects with keys: videoId (string), score (number 0.0-10.0), and decision (string "KEEP" or "REJECT").',
        "Use decision REJECT only for videos that clearly do not match preferences.",
        "Set decision KEEP for all other videos."
      ];
      const payload = {
        contents: [
          {
            parts: [
              {
                text: [
                  instructions.join(" "),
                  "USER PREFERENCES:",
                  JSON.stringify(preferences),
                  "VIDEOS:",
                  JSON.stringify(
                    videos.map((video) => ({
                      videoId: video.videoId,
                      title: video.title,
                      channel: video.channel,
                      durationSeconds: video.durationSeconds,
                      views: video.views,
                      published: video.published,
                      url: video.url,
                      sourcePage: video.sourcePage
                    }))
                  )
                ].join("\n\n")
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      };
      return JSON.stringify(payload);
    }
    async sendRequest(prompt) {
      if (!this.apiKey) {
        throw new Error("Gemini API key missing");
      }
      const url = `${GEMINI_ENDPOINT}/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: prompt,
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`Gemini HTTP ${response.status}`);
        }
        return await response.json();
      } finally {
        clearTimeout(timeoutId);
      }
    }
    parseResponse(response, videos) {
      const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        this.logger.warn("Gemini response missing text content", response);
        return this.fallbackScores(videos);
      }
      const parsed = safeParseJson(text, null);
      if (!parsed || !Array.isArray(parsed.videos)) {
        this.logger.warn("Gemini response was malformed JSON", text);
        return this.fallbackScores(videos);
      }
      const validIds = new Set(videos.map((video) => video.videoId));
      const results = parsed.videos.filter((item) => item && validIds.has(item.videoId)).map((item) => {
        const score = Number(item.score);
        const decision = item.decision === "REJECT" ? "REJECT" : "KEEP";
        return {
          videoId: item.videoId,
          score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0,
          decision
        };
      });
      const byId = new Map(results.map((item) => [item.videoId, item]));
      return videos.map((video) => byId.get(video.videoId) || { videoId: video.videoId, score: 0, decision: "KEEP" });
    }
    fallbackScores(videos) {
      return videos.map((video) => ({ videoId: video.videoId, score: 0, decision: "KEEP" }));
    }
  };

  // src/overlay.js
  var BADGE_CLASS = "feed-coach-badge";
  var Overlay = class {
    constructor({ bus, logger, platform }) {
      this.bus = bus;
      this.logger = logger;
      this.platform = platform;
      this.activeBadges = /* @__PURE__ */ new WeakMap();
    }
    async initialize() {
      this.bus.on("DECISION", (decision) => this.handleDecision(decision));
      this.logger.info("Overlay initialized");
    }
    handleDecision({ videoId, score, decision }) {
      const videoElement = this.platform.findElementByVideoId(videoId);
      if (!videoElement) {
        return;
      }
      const badge = this.createBadge(score, decision);
      this.removeBadge(videoElement);
      this.attachBadge(videoElement, badge);
      this.logger.debug("Overlay updated", videoId, score, decision);
      this.bus.emit("OVERLAY_UPDATED", { videoId, score, decision });
    }
    createBadge(score, decision) {
      const badge = document.createElement("div");
      badge.className = BADGE_CLASS;
      badge.textContent = `${decision === "REJECT" ? "\u{1F534}" : "\u{1F7E2}"} ${Number(score).toFixed(1)}`;
      badge.style.position = "absolute";
      badge.style.top = "8px";
      badge.style.right = "8px";
      badge.style.zIndex = "9999";
      badge.style.padding = "2px 6px";
      badge.style.borderRadius = "12px";
      badge.style.fontSize = "12px";
      badge.style.fontWeight = "600";
      badge.style.color = "#fff";
      badge.style.background = decision === "REJECT" ? "rgba(186, 26, 26, 0.9)" : "rgba(27, 94, 32, 0.9)";
      badge.style.pointerEvents = "none";
      return badge;
    }
    attachBadge(element, badge) {
      const container = this.platform.findThumbnailContainer(element);
      if (!container) {
        return;
      }
      container.style.position = container.style.position || "relative";
      container.appendChild(badge);
      this.activeBadges.set(element, badge);
    }
    removeBadge(element) {
      const existing = this.activeBadges.get(element);
      if (existing?.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      this.activeBadges.delete(element);
    }
  };

  // src/settings.js
  var Settings = class {
    constructor({ bus, logger, storage }) {
      this.bus = bus;
      this.logger = logger;
      this.storage = storage;
      this.state = {
        apiKey: "",
        preferences: {},
        provider: "gemini",
        threshold: 0,
        prompt: "",
        theme: "auto"
      };
    }
    async initialize() {
      const [apiKey, preferences, provider, threshold, prompt, theme] = await Promise.all([
        this.storage.get("apiKey", ""),
        this.storage.get("preferences", {}),
        this.storage.get("provider", "gemini"),
        this.storage.get("threshold", 0),
        this.storage.get("prompt", ""),
        this.storage.get("theme", "auto")
      ]);
      this.state = { apiKey, preferences, provider, threshold, prompt, theme };
      this.logger.info("Settings initialized");
    }
    async save(settings) {
      this.state = { ...this.state, ...settings };
      await Promise.all([
        this.storage.set("apiKey", this.state.apiKey),
        this.storage.set("preferences", this.state.preferences),
        this.storage.set("provider", this.state.provider),
        this.storage.set("threshold", this.state.threshold),
        this.storage.set("prompt", this.state.prompt),
        this.storage.set("theme", this.state.theme)
      ]);
      this.bus.emit("SETTINGS_CHANGED", this.state);
      this.logger.info("Settings saved");
    }
  };

  // src/dashboard.js
  var Dashboard = class {
    constructor({ bus, logger, storage }) {
      this.bus = bus;
      this.logger = logger;
      this.storage = storage;
      this.stats = {
        videosSeen: 0,
        videosScored: 0,
        queueSize: 0,
        apiCalls: 0,
        errors: 0,
        latencyMs: 0,
        provider: "gemini",
        apiHealth: "unknown"
      };
      this.root = null;
    }
    async initialize() {
      this.bus.on("VIDEO_FOUND", () => this.increment("videosSeen"));
      this.bus.on("QUEUE_UPDATED", ({ queueSize }) => this.updateQueueSize(queueSize));
      this.bus.on("AI_REQUEST_STARTED", () => this.increment("apiCalls"));
      this.bus.on("AI_REQUEST_FAILED", () => this.increment("errors"));
      this.bus.on("AI_REQUEST_SUCCESS", ({ latencyMs }) => this.updateLatency(latencyMs));
      this.bus.on("VIDEO_SCORED", () => this.increment("videosScored"));
      this.bus.on("SETTINGS_CHANGED", (state) => this.stats.provider = state.provider || this.stats.provider);
      this.logger.info("Dashboard initialized");
    }
    updateLatency(latencyMs) {
      if (typeof latencyMs === "number") {
        this.stats.latencyMs = latencyMs;
      }
    }
    increment(key) {
      if (typeof this.stats[key] !== "number") {
        return;
      }
      this.stats[key] += 1;
    }
    updateQueueSize(queueSize) {
      this.stats.queueSize = queueSize;
    }
  };

  // src/platform/youtube.js
  var VIDEO_CONTAINER_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer"
  ].join(", ");
  var THUMBNAIL_SELECTOR = 'a#thumbnail, a[href*="/watch?"], a[href*="shorts/"]';
  var YouTubePlatform = class {
    constructor({ logger, bus }) {
      this.logger = logger;
      this.bus = bus;
    }
    async initialize() {
      this.logger.info("YouTube platform initialized");
    }
    getVideoId(element) {
      const link = element.querySelector(THUMBNAIL_SELECTOR);
      const url = link?.href;
      if (!url) {
        return null;
      }
      const match = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
      return match ? match[1] : null;
    }
    getTitle(element) {
      const title = element.querySelector("#video-title, a#video-title-link, h3 a");
      return title?.textContent?.trim() || null;
    }
    getChannel(element) {
      const channel = element.querySelector('#channel-name, ytd-channel-name a, a.yt-simple-endpoint[href*="/@"], a.yt-simple-endpoint[href*="/channel/"]');
      return channel?.textContent?.trim() || null;
    }
    getThumbnail(element) {
      const img = element.querySelector("img");
      return img?.src || null;
    }
    getUrl(element) {
      const link = element.querySelector(THUMBNAIL_SELECTOR);
      return link?.href || null;
    }
    getDuration(element) {
      const duration = element.querySelector("span.ytd-thumbnail-overlay-time-status-renderer, span.ytd-thumbnail-overlay-resume-playback-renderer");
      return duration?.textContent?.trim() || null;
    }
    getViews(element) {
      const node = element.querySelector("#metadata-line span:nth-child(1)");
      return node?.textContent?.trim() || null;
    }
    getPublished(element) {
      const node = element.querySelector("#metadata-line span:nth-child(2)");
      return node?.textContent?.trim() || null;
    }
    findElementByVideoId(videoId) {
      const selector = `a[href*="v=${videoId}"]`;
      const link = document.querySelector(selector);
      return link?.closest(VIDEO_CONTAINER_SELECTOR) || null;
    }
    findThumbnailContainer(element) {
      return element.querySelector("#thumbnail") || element;
    }
  };

  // src/bootstrap.js
  var DEFAULT_BATCH_SIZE = 10;
  var DEFAULT_DEBOUNCE_MS = 500;
  async function bootstrap() {
    const logger = new Logger("[FeedCoach]");
    const bus = new EventBus();
    const storage = new Storage({ logger });
    const platform = new YouTubePlatform({ logger, bus });
    const queue = new QueueManager({ bus, logger, storage, batchSize: DEFAULT_BATCH_SIZE, debounceMs: DEFAULT_DEBOUNCE_MS });
    const decision = new DecisionEngine({ bus, logger });
    const provider = new GeminiProvider({ logger, storage, bus });
    const overlay = new Overlay({ bus, logger, platform });
    const settings = new Settings({ bus, logger, storage });
    const dashboard = new Dashboard({ bus, logger, storage });
    const observer = new FeedObserver({ bus, logger, platform });
    bus.on("ERROR", (error) => logger.error(error));
    bus.emit("BOOTSTRAP_STARTED");
    logger.info("Bootstrap started");
    await storage.initialize();
    await settings.initialize();
    await platform.initialize();
    await observer.initialize();
    await queue.initialize();
    await provider.initialize();
    await decision.initialize();
    await overlay.initialize();
    await dashboard.initialize();
    bus.emit("BOOTSTRAP_COMPLETED");
    logger.info("Bootstrap completed");
  }
  globalThis.bootstrap = bootstrap;
  bootstrap().catch((error) => {
    console.error("[FeedCoach] Bootstrap failed", error);
  });
})();
