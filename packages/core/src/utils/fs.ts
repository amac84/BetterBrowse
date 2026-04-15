import { promises as fs } from "fs";
import path from "path";

export async function ensureDir(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(targetPath: string): Promise<T | null> {
  if (!(await fileExists(targetPath))) {
    return null;
  }

  const raw = await fs.readFile(targetPath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeTextFile(targetPath: string, value: string): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, value, "utf8");
}

export async function removePath(targetPath: string): Promise<void> {
  if (await fileExists(targetPath)) {
    await fs.rm(targetPath, { recursive: true, force: true });
  }
}

export async function walkFiles(rootDir: string, extensions?: string[]): Promise<string[]> {
  if (!(await fileExists(rootDir))) {
    return [];
  }

  const output: string[] = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await walkFiles(absolutePath, extensions)));
      continue;
    }

    if (!extensions || extensions.includes(path.extname(entry.name))) {
      output.push(absolutePath);
    }
  }

  return output;
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function toProjectRelative(projectRoot: string, absolutePath: string): string {
  const relativePath = path.relative(projectRoot, absolutePath);
  return toPosixPath(relativePath || ".");
}
