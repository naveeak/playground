export class Dashboard {
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
      provider: 'gemini',
      apiHealth: 'unknown'
    };
    this.root = null;
  }

  async initialize() {
    this.bus.on('VIDEO_FOUND', () => this.increment('videosSeen'));
    this.bus.on('QUEUE_UPDATED', ({ queueSize }) => this.updateQueueSize(queueSize));
    this.bus.on('AI_REQUEST_STARTED', () => this.increment('apiCalls'));
    this.bus.on('AI_REQUEST_FAILED', () => this.increment('errors'));
    this.bus.on('AI_REQUEST_SUCCESS', ({ latencyMs }) => this.updateLatency(latencyMs));
    this.bus.on('VIDEO_SCORED', () => this.increment('videosScored'));
    this.bus.on('SETTINGS_CHANGED', (state) => this.stats.provider = state.provider || this.stats.provider);
    this.logger.info('Dashboard initialized');
  }

  updateLatency(latencyMs) {
    if (typeof latencyMs === 'number') {
      this.stats.latencyMs = latencyMs;
    }
  }

  increment(key) {
    if (typeof this.stats[key] !== 'number') {
      return;
    }
    this.stats[key] += 1;
  }

  updateQueueSize(queueSize) {
    this.stats.queueSize = queueSize;
  }
}
