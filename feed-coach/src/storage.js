export class Storage {
  constructor({ logger }) {
    this.logger = logger;
  }

  async initialize() {
    this.logger.debug('Storage initialized');
  }

  async get(key, defaultValue = null) {
    try {
      const value = await GM_getValue(key);
      return value === undefined ? defaultValue : value;
    } catch (error) {
      this.logger.warn('Storage.get failed', key, error);
      return defaultValue;
    }
  }

  async set(key, value) {
    try {
      await GM_setValue(key, value);
    } catch (error) {
      this.logger.warn('Storage.set failed', key, error);
    }
  }

  async remove(key) {
    try {
      await GM_deleteValue(key);
    } catch (error) {
      this.logger.warn('Storage.remove failed', key, error);
    }
  }
}
