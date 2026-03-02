import type { Browser, BrowserContext } from "playwright";
import { chromium } from "playwright";

export class BrowserManager {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    if (this.launching) {
      return this.launching;
    }

    this.launching = this.launch();
    try {
      this.browser = await this.launching;
      return this.browser;
    } finally {
      this.launching = null;
    }
  }

  private async launch(): Promise<Browser> {
    return chromium.launch({ headless: true });
  }

  async createContext(options?: {
    width?: number;
    height?: number;
  }): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    return browser.newContext({
      viewport: {
        width: options?.width ?? 1280,
        height: options?.height ?? 720,
      },
    });
  }

  async shutdown(): Promise<void> {
    if (this.browser?.isConnected()) {
      await this.browser.close();
    }
    this.browser = null;
    this.launching = null;
  }
}
