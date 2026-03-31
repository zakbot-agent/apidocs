import * as fs from "fs";
import * as path from "path";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  "coverage", ".cache", "__pycache__", ".turbo", ".vercel"
]);

const SUPPORTED_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs"]);

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export function scanProject(projectPath: string): ScannedFile[] {
  const resolved = path.resolve(projectPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Project path not found: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }

  const files: ScannedFile[] = [];
  walkDir(resolved, resolved, files);
  return files;
}

function walkDir(dir: string, root: string, files: ScannedFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        walkDir(fullPath, root, files);
      }
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        files.push({
          absolutePath: fullPath,
          relativePath: path.relative(root, fullPath),
          content,
        });
      } catch {
        // skip unreadable files
      }
    }
  }
}
