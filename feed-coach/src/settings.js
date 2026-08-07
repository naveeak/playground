export class Settings {
  constructor({ bus, logger, storage }) {
    this.bus = bus;
    this.logger = logger;
    this.storage = storage;
    this.state = {
      apiKey: '',
      preferences: {},
      provider: 'gemini',
      threshold: 0,
      prompt: '',
      theme: 'auto'
    };
  }

  async initialize() {
    const [apiKey, preferences, provider, threshold, prompt, theme] = await Promise.all([
      this.storage.get('apiKey', ''),
      this.storage.get('preferences', {}),
      this.storage.get('provider', 'gemini'),
      this.storage.get('threshold', 0),
      this.storage.get('prompt', ''),
      this.storage.get('theme', 'auto')
    ]);
    this.state = { apiKey, preferences, provider, threshold, prompt, theme };
    this.logger.info('Settings initialized');
  }

  async save(settings) {
    this.state = { ...this.state, ...settings };
    await Promise.all([
      this.storage.set('apiKey', this.state.apiKey),
      this.storage.set('preferences', this.state.preferences),
      this.storage.set('provider', this.state.provider),
      this.storage.set('threshold', this.state.threshold),
      this.storage.set('prompt', this.state.prompt),
      this.storage.set('theme', this.state.theme)
    ]);
    this.bus.emit('SETTINGS_CHANGED', this.state);
    this.logger.info('Settings saved');
  }
}
