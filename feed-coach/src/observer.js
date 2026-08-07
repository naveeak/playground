import { extractVideoMetadata } from './extractor.js';
import { onIdle, cancelIdle } from './utils.js';

const SELECTORS = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-compact-video-renderer'
];

const OBSERVE_ROOT = '#contents, #primary, ytd-browse, ytd-watch-flexy, ytd-search';

export class FeedObserver {
  constructor({ bus, logger, platform }) {
    this.bus = bus;
    this.logger = logger;
    this.platform = platform;
    this.processedIds = new Set();
    this.mutationObserver = null;
    this.intersectionObserver = null;
    this.videoElements = new WeakMap();
    this.idleHandle = null;
    this.pendingElements = new Set();
    this.boundOnNavigation = this.onNavigation.bind(this);
    this.boundOnVisibilityChange = this.onVisibilityChange.bind(this);
    this.boundOnPageHide = this.onPageHide.bind(this);
  }

  async initialize() {
    this.logger.info('Observer initialized');
    this.startObservers();
    window.addEventListener('yt-navigate-finish', this.boundOnNavigation);
    document.addEventListener('visibilitychange', this.boundOnVisibilityChange);
    window.addEventListener('pageshow', this.boundOnNavigation);
    window.addEventListener('pagehide', this.boundOnPageHide);
  }

  startObservers() {
    this.stopObservers();

    this.intersectionObserver = new IntersectionObserver(
      (entries) => this.handleIntersections(entries),
      { threshold: 0.25, rootMargin: '200px 0px 200px 0px' }
    );

    this.mutationObserver = new MutationObserver((mutations) => this.handleMutations(mutations));
    const root = this.findObserveRoot();
    this.mutationObserver.observe(root, {
      subtree: true,
      childList: true
    });

    this.scanExisting();
    this.logger.info('Observer started');
  }

  findObserveRoot() {
    for (const selector of OBSERVE_ROOT.split(',')) {
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
    this.logger.info('Navigation detected');
    this.startObservers();
  }

  onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.logger.info('Visibility restored');
      this.startObservers();
    }
  }

  onPageHide() {
    this.logger.info('Page hidden');
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
        if (node.matches(SELECTORS.join(','))) {
          this.pendingElements.add(node);
        }
        node.querySelectorAll(SELECTORS.join(',')).forEach((element) => this.pendingElements.add(element));
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
      this.logger.debug('Video ready', metadata.videoId);
      this.bus.emit('VIDEO_READY', metadata);
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
    this.logger.debug('Video found', metadata.videoId);
    this.bus.emit('VIDEO_FOUND', metadata);
  }
}
