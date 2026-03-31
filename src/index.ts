#!/usr/bin/env node

import * as path from "path";
import * as fs from "fs";
import { scanProject } from "./scanner";
import { parseRoutes } from "./parser";
import { generateDocs } from "./generator";
import { formatTerminal, formatJson } from "./formatter";
import { startServer } from "./server";

interface CliArgs {
  projectPath: string;
  serve: boolean;
  port: number;
  output?: string;
  json: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    projectPath: process.cwd(),
    serve: false,
    port: 3470,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--serve":
      case "-s":
        result.serve = true;
        break;
      case "--port":
      case "-p":
        result.port = parseInt(args[++i], 10) || 3470;
        break;
      case "--output":
      case "-o":
        result.output = args[++i];
        break;
      case "--json":
      case "-j":
        result.json = true;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          result.projectPath = path.resolve(arg);
        }
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
  apidocs - Auto-generate interactive API documentation

  Usage:
    apidocs [path] [options]

  Arguments:
    path                  Project directory to scan (default: current dir)

  Options:
    --serve, -s           Start interactive web UI
    --port, -p <port>     Web UI port (default: 3470)
    --output, -o <file>   Export docs to JSON file
    --json, -j            Print docs as JSON to stdout
    --help, -h            Show this help

  Examples:
    apidocs                          Scan current project
    apidocs /path/to/project         Scan specific project
    apidocs --output docs.json       Export as JSON
    apidocs --serve                  Start web UI on port 3470
    apidocs /path --serve -p 8080    Scan + serve on custom port

  Supported frameworks:
    Express   (app.get, router.post, ...)
    Hono      (app.get, new Hono(), ...)
    Fastify   (fastify.get, fastify.post, ...)

  Auto-detects:
    - Route methods & paths
    - Path parameters (:id)
    - Zod body/query schemas
    - Response shapes
    - Route grouping via app.route() / app.use()
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Derive project name
  const projectName = path.basename(args.projectPath);

  console.log(`\n  Scanning ${args.projectPath}...`);

  // Scan files
  const files = scanProject(args.projectPath);
  console.log(`  Found ${files.length} source files`);

  // Parse routes
  const routes = parseRoutes(files);
  console.log(`  Detected ${routes.length} API endpoints`);

  if (routes.length === 0) {
    console.log("\n  No API routes found. Make sure the project uses Express, Hono, or Fastify.\n");
    process.exit(0);
  }

  // Generate docs
  const doc = generateDocs(routes, projectName);

  // Output
  if (args.output) {
    const json = formatJson(doc);
    fs.writeFileSync(args.output, json, "utf-8");
    console.log(`  Docs exported to ${args.output}`);
  }

  if (args.json) {
    console.log(formatJson(doc));
  } else if (args.serve) {
    // Print summary then start server
    console.log(formatTerminal(doc));
    startServer(doc, args.port);
  } else if (!args.output) {
    // Default: print to terminal
    console.log(formatTerminal(doc));
  }
}

main();
