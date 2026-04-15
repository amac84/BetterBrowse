import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveReachableBaseUrl } from "../src/core/base-url";

const tempRoots: string[] = [];

describe("base URL resolution", () => {
  afterEach(async () => {
    for (const tempRoot of tempRoots.splice(0)) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps the configured base URL when it is reachable", async () => {
    const tempRoot = await createTempRoot("betterbrowse-base-url-configured-");
    await writeProjectFile(
      tempRoot,
      "package.json",
      JSON.stringify(
        {
          scripts: {
            dev: "next dev"
          }
        },
        null,
        2
      )
    );

    const probes: string[] = [];
    const result = await resolveReachableBaseUrl(tempRoot, "http://localhost:3000", {
      fetchImpl: async (input) => {
        probes.push(input);
        const url = new URL(input);
        if (url.protocol === "http:" && url.hostname === "localhost" && url.port === "3000") {
          return {};
        }

        throw new Error("offline");
      }
    });

    expect(result.autoDetected).toBe(false);
    expect(new URL(result.resolvedBaseUrl).hostname).toBe("localhost");
    expect(new URL(result.resolvedBaseUrl).port).toBe("3000");
    expect(probes).toHaveLength(1);
  });

  it("falls back to inferred Vite port when configured URL is down", async () => {
    const tempRoot = await createTempRoot("betterbrowse-base-url-vite-");
    await writeProjectFile(
      tempRoot,
      "package.json",
      JSON.stringify(
        {
          scripts: {
            dev: "vite"
          }
        },
        null,
        2
      )
    );

    const result = await resolveReachableBaseUrl(tempRoot, "http://localhost:3000", {
      fetchImpl: async (input) => {
        const url = new URL(input);
        if (url.protocol === "http:" && url.hostname === "localhost" && url.port === "5173") {
          return {};
        }

        throw new Error("offline");
      }
    });

    expect(result.autoDetected).toBe(true);
    expect(new URL(result.resolvedBaseUrl).hostname).toBe("localhost");
    expect(new URL(result.resolvedBaseUrl).port).toBe("5173");
  });

  it("falls back between localhost and 127.0.0.1 on the same port", async () => {
    const tempRoot = await createTempRoot("betterbrowse-base-url-host-");
    await writeProjectFile(tempRoot, "package.json", "{}\n");

    const result = await resolveReachableBaseUrl(tempRoot, "http://localhost:5173", {
      fetchImpl: async (input) => {
        const url = new URL(input);
        if (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "5173") {
          return {};
        }

        throw new Error("offline");
      }
    });

    expect(result.autoDetected).toBe(true);
    expect(new URL(result.resolvedBaseUrl).hostname).toBe("127.0.0.1");
    expect(new URL(result.resolvedBaseUrl).port).toBe("5173");
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(tempRoot);
  return tempRoot;
}

async function writeProjectFile(projectRoot: string, relativePath: string, contents: string): Promise<void> {
  const absolutePath = path.join(projectRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents, "utf8");
}
