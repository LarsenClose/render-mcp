import { describe, it, expect, afterEach } from "vitest";
import { BrowserManager } from "../../src/browser.js";

describe("BrowserManager", () => {
  let manager: BrowserManager;

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
    }
  });

  it("lazily launches browser on first getBrowser call", async () => {
    manager = new BrowserManager();
    const browser = await manager.getBrowser();
    expect(browser.isConnected()).toBe(true);
  });

  it("returns the same browser instance on subsequent calls", async () => {
    manager = new BrowserManager();
    const b1 = await manager.getBrowser();
    const b2 = await manager.getBrowser();
    expect(b1).toBe(b2);
  });

  it("creates isolated browser contexts", async () => {
    manager = new BrowserManager();
    const ctx1 = await manager.createContext({ width: 800, height: 600 });
    const ctx2 = await manager.createContext({ width: 1024, height: 768 });

    expect(ctx1).not.toBe(ctx2);

    await ctx1.close();
    await ctx2.close();
  });

  it("shuts down cleanly", async () => {
    manager = new BrowserManager();
    const browser = await manager.getBrowser();
    expect(browser.isConnected()).toBe(true);

    await manager.shutdown();
    expect(browser.isConnected()).toBe(false);
  });

  it("recovers after shutdown by relaunching", async () => {
    manager = new BrowserManager();
    await manager.getBrowser();
    await manager.shutdown();

    const browser = await manager.getBrowser();
    expect(browser.isConnected()).toBe(true);
  });

  it("does not double-launch when concurrent getBrowser calls happen", async () => {
    manager = new BrowserManager();
    const [b1, b2, b3] = await Promise.all([
      manager.getBrowser(),
      manager.getBrowser(),
      manager.getBrowser(),
    ]);

    expect(b1).toBe(b2);
    expect(b2).toBe(b3);
  });
});
