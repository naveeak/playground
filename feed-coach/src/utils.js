export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeParseJson(value, defaultValue = null) {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Debounce a function. Returns a wrapped function that delays invocation
 * until `waitMs` has elapsed since the last call.
 */
export function debounce(fn, waitMs) {
  let timer = null;
  return function debounced(...args) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, waitMs);
  };
}

/**
 * Run a callback during idle time, falling back to a timeout when
 * requestIdleCallback is unavailable.
 */
export function onIdle(callback, timeoutMs = 2000) {
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback(callback, { timeout: timeoutMs });
  }
  return setTimeout(callback, 1);
}

export function cancelIdle(handle) {
  if (typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}
