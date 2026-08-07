export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
    if (handlers.length === 0) {
      this.listeners.delete(event);
    }
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }
    handlers.slice().forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error('[FeedCoach] Event handler failed', event, error);
      }
    });
  }
}
