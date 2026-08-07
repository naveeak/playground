export class DecisionEngine {
  constructor({ bus, logger }) {
    this.bus = bus;
    this.logger = logger;
    this.handleVideoScored = this.handleVideoScored.bind(this);
  }

  async initialize() {
    this.bus.on('VIDEO_SCORED', this.handleVideoScored);
    this.logger.info('Decision engine initialized');
  }

  handleVideoScored(scores) {
    if (!Array.isArray(scores)) {
      return;
    }
    scores.forEach((item) => {
      this.bus.emit('DECISION', {
        videoId: item.videoId,
        score: item.score,
        decision: item.decision
      });
      this.logger.debug('Video scored', item.videoId, item.score, item.decision);
    });
  }
}
