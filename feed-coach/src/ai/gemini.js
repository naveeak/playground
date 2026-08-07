import { AIProvider } from './provider.js';
import { safeParseJson, delay } from '../utils.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiProvider extends AIProvider {
  constructor({ logger, storage, bus }) {
    super();
    this.logger = logger;
    this.storage = storage;
    this.bus = bus;
    this.apiKey = null;
  }

  async initialize() {
    this.apiKey = await this.storage.get('apiKey', '');
    this.bus.on('BATCH_READY', (batch) => this.handleBatch(batch));
    this.logger.info('GeminiProvider initialized');
  }

  async handleBatch(batch) {
    if (!Array.isArray(batch) || batch.length === 0) {
      return;
    }
    this.bus.emit('AI_REQUEST_STARTED', { count: batch.length });
    const preferences = await this.storage.get('preferences', {});
    const startedAt = performance.now();
    try {
      const scores = await this.scoreVideos(batch, preferences);
      const latencyMs = Math.round(performance.now() - startedAt);
      this.bus.emit('AI_REQUEST_SUCCESS', { count: batch.length, latencyMs });
      this.bus.emit('VIDEO_SCORED', scores);
    } catch (error) {
      this.logger.warn('Gemini request failed, keeping videos', error);
      this.bus.emit('AI_REQUEST_FAILED', { error, count: batch.length });
      // Fail-open: keep every video in the batch.
      const fallback = batch.map((video) => ({
        videoId: video.videoId,
        score: 0,
        decision: 'KEEP'
      }));
      this.bus.emit('VIDEO_SCORED', fallback);
    } finally {
      this.bus.emit('BATCH_COMPLETE', { count: batch.length });
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
        this.logger.warn('Retrying Gemini request', { attempt: attempt + 1, backoff, error });
        await delay(backoff);
      }
    }

    throw lastError;
  }

  buildPrompt(videos, preferences) {
    const instructions = [
      'You are an assistant that scores YouTube feed videos for relevance based on the user preferences.',
      'Return JSON only with no markdown, no explanation, and no additional keys.',
      'Provide an object with a key "videos" containing an array of objects with keys: videoId (string), score (number 0.0-10.0), and decision (string "KEEP" or "REJECT").',
      'Use decision REJECT only for videos that clearly do not match preferences.',
      'Set decision KEEP for all other videos.'
    ];

    const payload = {
      contents: [
        {
          parts: [
            {
              text: [
                instructions.join(' '),
                'USER PREFERENCES:',
                JSON.stringify(preferences),
                'VIDEOS:',
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
              ].join('\n\n')
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json'
      }
    };

    return JSON.stringify(payload);
  }

  async sendRequest(prompt) {
    if (!this.apiKey) {
      throw new Error('Gemini API key missing');
    }
    const url = `${GEMINI_ENDPOINT}/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
    if (typeof text !== 'string') {
      this.logger.warn('Gemini response missing text content', response);
      return this.fallbackScores(videos);
    }

    const parsed = safeParseJson(text, null);
    if (!parsed || !Array.isArray(parsed.videos)) {
      this.logger.warn('Gemini response was malformed JSON', text);
      return this.fallbackScores(videos);
    }

    const validIds = new Set(videos.map((video) => video.videoId));
    const results = parsed.videos
      .filter((item) => item && validIds.has(item.videoId))
      .map((item) => {
        const score = Number(item.score);
        const decision = item.decision === 'REJECT' ? 'REJECT' : 'KEEP';
        return {
          videoId: item.videoId,
          score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0,
          decision
        };
      });

    // Ensure every video in the batch has a score (fail-open).
    const byId = new Map(results.map((item) => [item.videoId, item]));
    return videos.map((video) => byId.get(video.videoId) || { videoId: video.videoId, score: 0, decision: 'KEEP' });
  }

  fallbackScores(videos) {
    return videos.map((video) => ({ videoId: video.videoId, score: 0, decision: 'KEEP' }));
  }
}
