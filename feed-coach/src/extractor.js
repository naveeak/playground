export function extractVideoMetadata(element, platform) {
  if (!element) {
    return null;
  }

  const videoId = platform?.getVideoId(element) || extractVideoIdFromElement(element);
  if (!videoId) {
    return null;
  }

  const title = platform?.getTitle(element) || extractText(element, 'a#video-title') || extractText(element, 'h3');
  const channel = platform?.getChannel(element) || extractText(element, 'a.yt-simple-endpoint') || extractText(element, '#channel-name');
  const thumbnail = platform?.getThumbnail(element) || extractThumbnail(element);
  const url = platform?.getUrl(element) || extractUrl(element);
  const duration = platform?.getDuration(element) || extractText(element, 'span.ytd-thumbnail-overlay-time-status-renderer');
  const durationSeconds = parseDuration(duration);
  const views = platform?.getViews(element) || extractText(element, '#metadata-line span:nth-child(1)') || null;
  const published = platform?.getPublished(element) || extractText(element, '#metadata-line span:nth-child(2)') || null;
  const sourcePage = window.location.href;

  return {
    videoId,
    title: title?.trim() || '',
    channel: channel?.trim() || '',
    duration: duration?.trim() || '',
    durationSeconds,
    thumbnail,
    url,
    views: views?.trim() || '',
    published: published?.trim() || '',
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
  const img = element.querySelector('img');
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
  const parts = normalized.split(':').map(Number);
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
