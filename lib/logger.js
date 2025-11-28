import fs from 'fs/promises';
import path from 'path';

export default class Logger {
  constructor(logDir = 'logs') {
    this.logDir = logDir;
    this.logFile = null;
    this.logPath = null;
  }

  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      this.logPath = path.join(this.logDir, `recipe-generation-${timestamp}.log`);
      // Create log file
      await fs.writeFile(this.logPath, `=== Recipe Generation Log - ${new Date().toISOString()} ===\n`);
      console.log(`📝 Log file created: ${this.logPath}`);
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  async log(message) {
    console.log(message);
    if (this.logPath) {
      try {
        await fs.appendFile(this.logPath, message + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  async error(message) {
    console.error(message);
    if (this.logPath) {
      try {
        await fs.appendFile(this.logPath, `[ERROR] ${message}\n`);
      } catch (error) {
        console.error('Failed to write error to log file:', error);
      }
    }
  }

  async warn(message) {
    console.warn(message);
    if (this.logPath) {
      try {
        await fs.appendFile(this.logPath, `[WARN] ${message}\n`);
      } catch (error) {
        console.error('Failed to write warning to log file:', error);
      }
    }
  }
}
