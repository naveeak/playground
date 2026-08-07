const MAX_QUEUE_SIZE = 100;

export class QueueManager {
  constructor({ bus, logger, storage, batchSize, debounceMs }) {
    this.bus = bus;
    this.logger = logger;
    this.storage = storage;
    this.batchSize = batchSize;
    this.debounceMs = debounceMs;
    this.queue = [];
    this.videoIds = new Set();
    this.debounceTimer = null;
    this.processing = false;

    this.handleVideoReady = this.handleVideoReady.bind(this);
    this.handleBatchComplete = this.handleBatchComplete.bind(this);
  }

  async initialize() {
    this.bus.on('VIDEO_READY', this.handleVideoReady);
    this.bus.on('BATCH_COMPLETE', this.handleBatchComplete);
    this.logger.info('Queue initialized');
  }

  handleVideoReady(metadata) {
    if (!metadata || !metadata.videoId) {
      return;
    }
    // Prevent duplicate processing: once a video has been queued it is never
    // re-queued, even after its batch is emitted.
    if (this.videoIds.has(metadata.videoId)) {
      return;
    }
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.logger.warn('Queue full, dropping video', metadata.videoId);
      return;
    }
    this.queue.push(metadata);
    this.videoIds.add(metadata.videoId);
    this.logger.debug('Queue updated', this.queue.length);
    this.bus.emit('QUEUE_UPDATED', { queueSize: this.queue.length });
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
    this.logger.info('Batch ready', batch.length);
    this.bus.emit('BATCH_READY', batch);
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
}
