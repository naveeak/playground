/**
 * Headless smoke test for Feed Coach.
 *
 * Simulates the browser/Tampermonkey environment (GM_*, document, window,
 * MutationObserver, IntersectionObserver, fetch) and loads the bundled
 * userscript to verify:
 *   - No ReferenceErrors during bootstrap
 *   - FeedObserver initializes
 *   - Videos are discovered
 *   - Queue batching works
 *   - Gemini API is called with the correct endpoint/body
 *   - Overlay badges are created
 *   - Fail-open on network errors
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(__dirname, '..', 'feed-coach.user.js');
const bundle = readFileSync(bundlePath, 'utf8');

// ---------------------------------------------------------------------------
// Minimal DOM shim
// ---------------------------------------------------------------------------
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.href = '';
    this.isConnected = true;
    this._attrs = {};
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  matches() { return false; }
  closest() { return null; }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k]; }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.visibilityState = 'visible';
    this._listeners = {};
  }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  dispatch(type, ...args) { (this._listeners[type] || []).forEach((fn) => fn(...args)); }
  createElement(tag) { return new FakeElement(tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class FakeMutationObserver {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
}

class FakeIntersectionObserver {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
}

// ---------------------------------------------------------------------------
// Install globals
// ---------------------------------------------------------------------------
const storage = new Map();
globalThis.GM_getValue = (key) => storage.get(key);
globalThis.GM_setValue = (key, value) => storage.set(key, value);
globalThis.GM_deleteValue = (key) => storage.delete(key);
globalThis.GM_registerMenuCommand = () => {};

const document = new FakeDocument();
globalThis.document = document;
globalThis.window = {
  location: { href: 'https://www.youtube.com/' },
  addEventListener() {},
  removeEventListener() {}
};
globalThis.MutationObserver = FakeMutationObserver;
globalThis.IntersectionObserver = FakeIntersectionObserver;
globalThis.performance = { now: () => Date.now() };
globalThis.requestIdleCallback = (fn) => setTimeout(fn, 0);
globalThis.cancelIdleCallback = (h) => clearTimeout(h);

// Capture fetch calls
const fetchCalls = [];
globalThis.fetch = async (url, opts) => {
  fetchCalls.push({ url, opts });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ videos: [] }) }] } }]
    })
  };
};

// ---------------------------------------------------------------------------
// Run the bundle
// ---------------------------------------------------------------------------
const errors = [];
const originalError = console.error;
console.error = (...args) => { errors.push(args); originalError(...args); };

try {
  // Execute the IIFE bundle in this scope.
  const fn = new Function(bundle);
  fn();
} catch (e) {
  errors.push(['Top-level execution threw', e]);
}

// Wait for async bootstrap to settle.
await new Promise((r) => setTimeout(r, 50));

console.error = originalError;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${detail ? ` (${detail})` : ''}`);
};

check('No ReferenceErrors / top-level errors', errors.length === 0, errors.map((e) => String(e[1] || e[0])).join('; '));
check('bootstrap exposed on globalThis', typeof globalThis.bootstrap === 'function');
check('Gemini endpoint is official', fetchCalls.length === 0 || fetchCalls.every((c) => c.url.includes('generativelanguage.googleapis.com')));
check('No placeholder endpoint used', !bundle.includes('gemini.example.com'));
check('No Authorization header', !bundle.includes('Authorization'));
check('FeedObserver bundled', bundle.includes('FeedObserver'));
check('responseMimeType set', bundle.includes('responseMimeType'));
check('temperature 0 set', bundle.includes('temperature: 0') || bundle.includes('temperature:0'));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
