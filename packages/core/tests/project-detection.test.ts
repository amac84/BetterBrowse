import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { detectProject } from "../src/config/project-detection";

const tempRoots: string[] = [];

describe("project detection", () => {
  afterEach(async () => {
    for (const tempRoot of tempRoots.splice(0)) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("detects plain HTML projects and derives static routes", async () => {
    const tempRoot = await createTempRoot("betterbrowse-html-project-");
    await writeProjectFile(tempRoot, "index.html", "<html><body>Home</body></html>\n");
    await writeProjectFile(tempRoot, "about.html", "<html><body>About</body></html>\n");
    await writeProjectFile(tempRoot, "docs/getting-started.html", "<html><body>Docs</body></html>\n");
    await writeProjectFile(tempRoot, "blog/index.htm", "<html><body>Blog</body></html>\n");
    await writeProjectFile(tempRoot, "node_modules/ignored.html", "<html><body>Ignore</body></html>\n");
    await writeProjectFile(tempRoot, "dist/ignored-too.html", "<html><body>Ignore</body></html>\n");
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

    const detection = await detectProject(tempRoot);

    expect(detection.framework).toBe("html");
    expect(detection.baseUrl).toBe("http://localhost:5173");
    expect(detection.routes).toEqual(["/", "/about", "/blog", "/docs/getting-started"]);
  });

  it("keeps React detection precedence over static HTML entry points", async () => {
    const tempRoot = await createTempRoot("betterbrowse-react-project-");
    await writeProjectFile(
      tempRoot,
      "package.json",
      JSON.stringify(
        {
          dependencies: {
            react: "^19.0.0"
          }
        },
        null,
        2
      )
    );
    await writeProjectFile(tempRoot, "index.html", "<html><body>Shell</body></html>\n");
    await writeProjectFile(tempRoot, "src/App.tsx", "export function App() { return <main>Hello</main>; }\n");

    const detection = await detectProject(tempRoot);

    expect(detection.framework).toBe("react");
    expect(detection.routes).toEqual(["/"]);
  });

  it("does not mark known JS framework projects as plain HTML", async () => {
    const tempRoot = await createTempRoot("betterbrowse-vue-project-");
    await writeProjectFile(
      tempRoot,
      "package.json",
      JSON.stringify(
        {
          dependencies: {
            vue: "^3.5.0"
          }
        },
        null,
        2
      )
    );
    await writeProjectFile(tempRoot, "index.html", "<html><body>Vue shell</body></html>\n");

    const detection = await detectProject(tempRoot);

    expect(detection.framework).toBe("unknown");
    expect(detection.routes).toEqual(["/"]);
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
