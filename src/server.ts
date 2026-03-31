import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { ApiDoc } from "./generator";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function startServer(doc: ApiDoc, port: number): void {
  const publicDir = path.join(__dirname, "..", "public");

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // API endpoint: serve docs as JSON
    if (url.pathname === "/api/docs") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(doc));
      return;
    }

    // Serve static files
    let filePath: string;
    if (url.pathname === "/" || url.pathname === "/index.html") {
      filePath = path.join(publicDir, "index.html");
    } else {
      filePath = path.join(publicDir, url.pathname);
    }

    // Security: prevent path traversal
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath)) {
      // SPA fallback
      filePath = path.join(publicDir, "index.html");
    }

    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  server.listen(port, () => {
    console.log(`\n  API Docs server running at http://localhost:${port}`);
    console.log(`  Serving ${doc.totalRoutes} endpoints from ${doc.projectName}\n`);
  });
}
