import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { BrowserEngine, BrowserLog, DomSnapshot, EngineConfig, ViewportConfig } from "../types";

export class PlaywrightBrowserEngine implements BrowserEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private consoleMessages: BrowserLog[] = [];

  public async start(config: EngineConfig = {}): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: config.headless ?? true
    });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    this.page.on("console", (message) => {
      const type = message.type();
      const level = type === "warning" ? "warning" : type === "error" ? "error" : "log";
      const location = message.location();
      this.consoleMessages.push({
        level,
        text: message.text(),
        location: location.url ? `${location.url}:${location.lineNumber ?? 0}` : undefined
      });
    });

    this.page.on("pageerror", (error) => {
      this.consoleMessages.push({
        level: "pageerror",
        text: error.message
      });
    });
  }

  public async setViewport(viewport: ViewportConfig): Promise<void> {
    await this.getPage().setViewportSize({ width: viewport.width, height: viewport.height });
  }

  public async goto(url: string): Promise<void> {
    const page = this.getPage();
    this.consoleMessages = [];
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  }

  public async screenshot(outputPath: string): Promise<string> {
    await this.getPage().screenshot({ path: outputPath, fullPage: true });
    return outputPath;
  }

  public async getDomSnapshot(viewport: ViewportConfig): Promise<DomSnapshot> {
    return this.getPage().evaluate((currentViewport) => {
      const getElementText = (element: Element): string => {
        const htmlElement = element as HTMLElement;
        return htmlElement.innerText ?? element.textContent ?? "";
      };

      const makeSelector = (element: Element | null): string | undefined => {
        if (!element) {
          return undefined;
        }

        if (element.id) {
          return `#${element.id}`;
        }

        const segments: string[] = [];
        let current: Element | null = element;
        while (current && current.tagName.toLowerCase() !== "html") {
          const parent: Element | null = current.parentElement;
          if (!parent) {
            segments.unshift(current.tagName.toLowerCase());
            break;
          }

          const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current?.tagName);
          const index = siblings.indexOf(current) + 1;
          segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
          current = parent;
        }

        return segments.join(" > ");
      };

      const getAssociatedLabel = (element: Element): string => {
        const id = element.getAttribute("id");
        if (id) {
          const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (label?.textContent) {
            return label.textContent.replace(/\s+/g, " ").trim();
          }
        }

        const wrappingLabel = element.closest("label");
        if (wrappingLabel?.textContent) {
          return wrappingLabel.textContent.replace(/\s+/g, " ").trim();
        }

        return "";
      };

      const getAccessibleName = (element: Element): string => {
        const ariaLabel = element.getAttribute("aria-label");
        if (ariaLabel?.trim()) {
          return ariaLabel.trim();
        }

        const labelledBy = element.getAttribute("aria-labelledby");
        if (labelledBy) {
          const labelText = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim() ?? "")
            .filter(Boolean)
            .join(" ");
          if (labelText) {
            return labelText;
          }
        }

        if (element instanceof HTMLImageElement && element.alt.trim()) {
          return element.alt.trim();
        }

        const associatedLabel = getAssociatedLabel(element);
        if (associatedLabel) {
          return associatedLabel;
        }

        const text = getElementText(element);
        const normalized = text.replace(/\s+/g, " ").trim();
        return normalized ? normalized.slice(0, 120) : "";
      };

      const nodes = Array.from(document.querySelectorAll("*"))
        .slice(0, 1500)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const visible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number.parseFloat(style.opacity || "1") > 0 &&
            rect.width > 0 &&
            rect.height > 0;
          const inViewport = rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
          const text = getElementText(element);
          const normalizedText = text.replace(/\s+/g, " ").trim();

          return {
            selector: makeSelector(element) ?? element.tagName.toLowerCase(),
            tagName: element.tagName.toLowerCase(),
            role: element.getAttribute("role"),
            textPreview: normalizedText.slice(0, 160),
            classList: Array.from(element.classList).slice(0, 40),
            attributes: {
              id: element.getAttribute("id") ?? undefined,
              href: element.getAttribute("href") ?? undefined,
              type: element.getAttribute("type") ?? undefined,
              alt: element.getAttribute("alt") ?? undefined,
              name: element.getAttribute("name") ?? undefined,
              placeholder: element.getAttribute("placeholder") ?? undefined,
              "aria-label": element.getAttribute("aria-label") ?? undefined,
              "aria-hidden": element.getAttribute("aria-hidden") ?? undefined
            },
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              right: rect.right,
              bottom: rect.bottom
            },
            parentSelector: makeSelector(element.parentElement),
            computed: {
              display: style.display,
              position: style.position,
              overflowX: style.overflowX,
              overflowY: style.overflowY,
              textAlign: style.textAlign,
              justifyContent: style.justifyContent,
              alignItems: style.alignItems,
              color: style.color,
              backgroundColor: style.backgroundColor,
              fontSize: Number.parseFloat(style.fontSize),
              fontWeight: Number.parseFloat(style.fontWeight)
            },
            metrics: {
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
              scrollHeight: element.scrollHeight,
              clientHeight: element.clientHeight
            },
            visibility: {
              visible,
              inViewport,
              clipped:
                element.scrollWidth > element.clientWidth + 1 ||
                element.scrollHeight > element.clientHeight + 1 ||
                rect.right > window.innerWidth + 1
            },
            accessibleName: getAccessibleName(element)
          };
        });

      return {
        url: window.location.href,
        title: document.title,
        viewport: currentViewport,
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight
        },
        nodes
      };
    }, viewport);
  }

  public async getConsoleMessages(): Promise<BrowserLog[]> {
    return [...this.consoleMessages];
  }

  public async stop(): Promise<void> {
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  private getPage(): Page {
    if (!this.page) {
      throw new Error("Browser page is not started.");
    }

    return this.page;
  }
}
