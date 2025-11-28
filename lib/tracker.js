import fs from 'fs/promises';

export default class ProcessedTracker {
  constructor(trackerFile = '.processed_urls.json') {
    this.trackerFile = trackerFile;
    this.processed = new Set();
  }

  async load() {
    try {
      const content = await fs.readFile(this.trackerFile, 'utf-8');
      const data = JSON.parse(content);
      this.processed = new Set(data.urls || []);
      console.log(`📋 Loaded ${this.processed.size} previously processed URLs from ${this.trackerFile}`);
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      console.log(`📋 No previous records found, starting fresh`);
      this.processed = new Set();
    }
  }

  has(url) {
    return this.processed.has(url);
  }

  add(url) {
    this.processed.add(url);
  }

  async save() {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        count: this.processed.size,
        urls: Array.from(this.processed),
      };
      await fs.writeFile(this.trackerFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save tracker:', error);
    }
  }
}
