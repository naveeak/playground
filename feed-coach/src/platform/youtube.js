const VIDEO_CONTAINER_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-compact-video-renderer'
].join(', ');

const THUMBNAIL_SELECTOR = 'a#thumbnail, a[href*="/watch?"], a[href*="shorts/"]';

export class YouTubePlatform {
  constructor({ logger, bus }) {
    this.logger = logger;
    this.bus = bus;
  }

  async initialize() {
    this.logger.info('YouTube platform initialized');
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
    const title = element.querySelector('#video-title, a#video-title-link, h3 a');
    return title?.textContent?.trim() || null;
  }

  getChannel(element) {
    const channel = element.querySelector('#channel-name, ytd-channel-name a, a.yt-simple-endpoint[href*="/@"], a.yt-simple-endpoint[href*="/channel/"]');
    return channel?.textContent?.trim() || null;
  }

  getThumbnail(element) {
    const img = element.querySelector('img');
    return img?.src || null;
  }

  getUrl(element) {
    const link = element.querySelector(THUMBNAIL_SELECTOR);
    return link?.href || null;
  }

  getDuration(element) {
    const duration = element.querySelector('span.ytd-thumbnail-overlay-time-status-renderer, span.ytd-thumbnail-overlay-resume-playback-renderer');
    return duration?.textContent?.trim() || null;
  }

  getViews(element) {
    const node = element.querySelector('#metadata-line span:nth-child(1)');
    return node?.textContent?.trim() || null;
  }

  getPublished(element) {
    const node = element.querySelector('#metadata-line span:nth-child(2)');
    return node?.textContent?.trim() || null;
  }

  findElementByVideoId(videoId) {
    const selector = `a[href*="v=${videoId}"]`;
    const link = document.querySelector(selector);
    return link?.closest(VIDEO_CONTAINER_SELECTOR) || null;
  }

  findThumbnailContainer(element) {
    return element.querySelector('#thumbnail') || element;
  }
}
