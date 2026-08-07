import { Logger } from './logger.js';
import { EventBus } from './events.js';
import { Storage } from './storage.js';
import { QueueManager } from './queue.js';
import { DecisionEngine } from './decision.js';
import { FeedObserver } from './observer.js';
import { GeminiProvider } from './ai/gemini.js';
import { Overlay } from './overlay.js';
import { Settings } from './settings.js';
import { Dashboard } from './dashboard.js';
import { YouTubePlatform } from './platform/youtube.js';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Initializes Feed Coach and starts observers.
 *
 * Initialization order:
 *   Storage -> Settings -> Platform -> Observer -> Queue ->
 *   GeminiProvider -> DecisionEngine -> Overlay -> Dashboard
 *
 * Every async initialize() is awaited so that dependencies (e.g. the API key
 * loaded by Settings/Storage) are ready before dependent modules start.
 */
export async function bootstrap() {
  const logger = new Logger('[FeedCoach]');
  const bus = new EventBus();
  const storage = new Storage({ logger });
  const platform = new YouTubePlatform({ logger, bus });
  const queue = new QueueManager({ bus, logger, storage, batchSize: DEFAULT_BATCH_SIZE, debounceMs: DEFAULT_DEBOUNCE_MS });
  const decision = new DecisionEngine({ bus, logger });
  const provider = new GeminiProvider({ logger, storage, bus });
  const overlay = new Overlay({ bus, logger, platform });
  const settings = new Settings({ bus, logger, storage });
  const dashboard = new Dashboard({ bus, logger, storage });
  const observer = new FeedObserver({ bus, logger, platform });

  bus.on('ERROR', (error) => logger.error(error));

  bus.emit('BOOTSTRAP_STARTED');
  logger.info('Bootstrap started');

  // 1. Storage
  await storage.initialize();
  // 2. Settings (loads API key, preferences, etc. from storage)
  await settings.initialize();
  // 3. Platform
  await platform.initialize();
  // 4. Observer
  await observer.initialize();
  // 5. Queue
  await queue.initialize();
  // 6. GeminiProvider (reads API key from storage)
  await provider.initialize();
  // 7. DecisionEngine
  await decision.initialize();
  // 8. Overlay
  await overlay.initialize();
  // 9. Dashboard
  await dashboard.initialize();

  bus.emit('BOOTSTRAP_COMPLETED');
  logger.info('Bootstrap completed');
}

// Expose for debugging and self-start. Called inside the bundle scope so the
// function reference is always available.
globalThis.bootstrap = bootstrap;
bootstrap().catch((error) => {
  console.error('[FeedCoach] Bootstrap failed', error);
});
