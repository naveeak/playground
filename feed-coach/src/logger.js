export class Logger {
  constructor(prefix = '[FeedCoach]') {
    this.prefix = prefix;
  }

  debug(...args) {
    console.debug(this.prefix, ...args);
  }

  info(...args) {
    console.info(this.prefix, ...args);
  }

  warn(...args) {
    console.warn(this.prefix, ...args);
  }

  error(...args) {
    console.error(this.prefix, ...args);
  }
}
