const BADGE_CLASS = 'feed-coach-badge';

export class Overlay {
  constructor({ bus, logger, platform }) {
    this.bus = bus;
    this.logger = logger;
    this.platform = platform;
    this.activeBadges = new WeakMap();
  }

  async initialize() {
    this.bus.on('DECISION', (decision) => this.handleDecision(decision));
    this.logger.info('Overlay initialized');
  }

  handleDecision({ videoId, score, decision }) {
    const videoElement = this.platform.findElementByVideoId(videoId);
    if (!videoElement) {
      return;
    }
    const badge = this.createBadge(score, decision);
    this.removeBadge(videoElement);
    this.attachBadge(videoElement, badge);
    this.logger.debug('Overlay updated', videoId, score, decision);
    this.bus.emit('OVERLAY_UPDATED', { videoId, score, decision });
  }

  createBadge(score, decision) {
    const badge = document.createElement('div');
    badge.className = BADGE_CLASS;
    badge.textContent = `${decision === 'REJECT' ? '🔴' : '🟢'} ${Number(score).toFixed(1)}`;
    badge.style.position = 'absolute';
    badge.style.top = '8px';
    badge.style.right = '8px';
    badge.style.zIndex = '9999';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '12px';
    badge.style.fontSize = '12px';
    badge.style.fontWeight = '600';
    badge.style.color = '#fff';
    badge.style.background = decision === 'REJECT' ? 'rgba(186, 26, 26, 0.9)' : 'rgba(27, 94, 32, 0.9)';
    badge.style.pointerEvents = 'none';
    return badge;
  }

  attachBadge(element, badge) {
    const container = this.platform.findThumbnailContainer(element);
    if (!container) {
      return;
    }
    container.style.position = container.style.position || 'relative';
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
}
