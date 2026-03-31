import { ScannedFile } from "./scanner";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export type Framework = "express" | "hono" | "fastify" | "unknown";

export interface RouteParam {
  name: string;
  location: "path" | "query" | "body" | "header";
  type: string;
  required: boolean;
  description?: string;
}

export interface ZodSchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  constraints?: string[];
  enumValues?: string[];
  defaultValue?: string;
}

export interface ParsedRoute {
  method: HttpMethod;
  path: string;
  fullPath: string;
  file: string;
  line: number;
  framework: Framework;
  params: RouteParam[];
  bodySchema?: ZodSchemaField[];
  querySchema?: ZodSchemaField[];
  responseExample?: string;
  description?: string;
  middleware?: string[];
  routePrefix?: string;
}

interface RouteMount {
  prefix: string;
  varName: string;
}

/**
 * Detect which framework a file uses
 */
function detectFramework(content: string): Framework {
  if (/from\s+["']hono["']|require\s*\(\s*["']hono["']\s*\)/.test(content)) return "hono";
  if (/from\s+["']express["']|require\s*\(\s*["']express["']\s*\)/.test(content)) return "express";
  if (/from\s+["']fastify["']|require\s*\(\s*["']fastify["']\s*\)/.test(content)) return "fastify";
  return "unknown";
}

/**
 * Extract route mounts like app.route("/api/videos", videoRoutes)
 */
function extractRouteMounts(content: string): RouteMount[] {
  const mounts: RouteMount[] = [];

  // Hono: app.route("/prefix", routeVar)
  const honoRouteRe = /\w+\.route\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = honoRouteRe.exec(content)) !== null) {
    mounts.push({ prefix: m[1], varName: m[2] });
  }

  // Express: app.use("/prefix", router)
  const expressUseRe = /\w+\.use\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;
  while ((m = expressUseRe.exec(content)) !== null) {
    mounts.push({ prefix: m[1], varName: m[2] });
  }

  return mounts;
}

/**
 * Extract import mappings: { varName -> modulePath }
 */
function extractImports(content: string): Map<string, string> {
  const imports = new Map<string, string>();

  // import { foo } from "./path"
  const esRe = /import\s+\{([^}]+)\}\s+from\s+["'`]([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = esRe.exec(content)) !== null) {
    const names = m[1].split(",").map(n => n.trim().split(/\s+as\s+/).pop()!.trim());
    for (const name of names) {
      imports.set(name, m[2]);
    }
  }

  // import foo from "./path"
  const defaultRe = /import\s+(\w+)\s+from\s+["'`]([^"'`]+)["'`]/g;
  while ((m = defaultRe.exec(content)) !== null) {
    imports.set(m[1], m[2]);
  }

  return imports;
}

/**
 * Parse a Zod schema definition from source text
 */
function parseZodSchema(content: string, schemaName: string): ZodSchemaField[] {
  const fields: ZodSchemaField[] = [];

  // Find schema definition
  const schemaRe = new RegExp(
    `(?:const|let|var)\\s+${escapeRegex(schemaName)}\\s*=\\s*z\\.object\\s*\\(\\{([\\s\\S]*?)\\}\\s*\\)`,
    "m"
  );
  const match = schemaRe.exec(content);
  if (!match) return fields;

  const body = match[1];

  // Parse individual fields with balanced parens
  const fieldRe = /(\w+)\s*:\s*(z\.[^,\n]*(?:\([^)]*(?:\([^)]*\))*[^)]*\))*[^,\n]*)/g;
  let fm: RegExpExecArray | null;
  while ((fm = fieldRe.exec(body)) !== null) {
    const name = fm[1];
    const typeDef = fm[2].trim();

    const field: ZodSchemaField = {
      name,
      type: inferZodType(typeDef),
      required: !typeDef.includes(".optional()"),
    };

    // Extract enum values
    const enumMatch = typeDef.match(/z\.enum\s*\(\s*\[([^\]]+)\]\s*\)/);
    if (enumMatch) {
      field.enumValues = enumMatch[1]
        .split(",")
        .map(v => v.trim().replace(/["']/g, ""))
        .filter(Boolean);
    }

    // Extract constraints
    const constraints: string[] = [];
    const minMatch = typeDef.match(/\.min\s*\(\s*(\d+)\s*\)/);
    if (minMatch) constraints.push(`min: ${minMatch[1]}`);
    const maxMatch = typeDef.match(/\.max\s*\(\s*(\d+)\s*\)/);
    if (maxMatch) constraints.push(`max: ${maxMatch[1]}`);
    if (typeDef.includes(".url()")) constraints.push("format: url");
    if (typeDef.includes(".email()")) constraints.push("format: email");
    if (typeDef.includes(".uuid()")) constraints.push("format: uuid");
    if (constraints.length > 0) field.constraints = constraints;

    // Extract default
    const defaultMatch = typeDef.match(/\.default\s*\(\s*([^)]+)\s*\)/);
    if (defaultMatch) {
      field.defaultValue = defaultMatch[1].trim().replace(/["']/g, "");
    }

    fields.push(field);
  }

  return fields;
}

function inferZodType(typeDef: string): string {
  if (typeDef.startsWith("z.string")) return "string";
  if (typeDef.startsWith("z.number")) return "number";
  if (typeDef.startsWith("z.boolean")) return "boolean";
  if (typeDef.startsWith("z.enum")) return "enum";
  if (typeDef.startsWith("z.array")) {
    const innerMatch = typeDef.match(/z\.array\s*\(\s*z\.(\w+)/);
    if (innerMatch) {
      if (innerMatch[1] === "object") return "object[]";
      return `${innerMatch[1]}[]`;
    }
    return "array";
  }
  if (typeDef.startsWith("z.object")) return "object";
  if (typeDef.startsWith("z.date")) return "date";
  return "unknown";
}

/**
 * Extract response shape from handler body
 */
function extractResponseExample(handlerBody: string): string | undefined {
  // Look for c.json({ ... }) or res.json({ ... }) patterns
  const jsonCallRe = /(?:c|res|ctx)\.json\s*\(\s*\{([\s\S]*?)\}\s*(?:,\s*\d+\s*)?\)/;
  const match = jsonCallRe.exec(handlerBody);
  if (!match) return undefined;

  // Get the first response pattern (usually the success one)
  const body = match[1].trim();

  // Simplify: extract top-level keys
  const keys: string[] = [];
  const keyRe = /(\w+)\s*:/g;
  let km: RegExpExecArray | null;
  while ((km = keyRe.exec(body)) !== null) {
    if (!keys.includes(km[1])) keys.push(km[1]);
  }

  if (keys.length === 0) return undefined;

  const obj: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === "success") obj[key] = true;
    else if (key === "data") obj[key] = "{ ... }";
    else if (key === "error") continue; // skip error fields in success example
    else if (key === "status") obj[key] = "ok";
    else if (key === "message") obj[key] = "...";
    else obj[key] = "...";
  }

  return JSON.stringify(obj, null, 2);
}

/**
 * Extract path parameters from route path
 */
function extractPathParams(routePath: string): RouteParam[] {
  const params: RouteParam[] = [];
  const paramRe = /:(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(routePath)) !== null) {
    params.push({
      name: m[1],
      location: "path",
      type: "string",
      required: true,
    });
  }
  return params;
}

/**
 * Get the handler body (rough extraction)
 */
function extractHandlerBody(content: string, startIndex: number): string {
  let depth = 0;
  let started = false;
  let bodyStart = startIndex;

  for (let i = startIndex; i < content.length && i < startIndex + 3000; i++) {
    if (content[i] === "{") {
      if (!started) {
        started = true;
        bodyStart = i;
      }
      depth++;
    } else if (content[i] === "}") {
      depth--;
      if (started && depth === 0) {
        return content.slice(bodyStart, i + 1);
      }
    }
  }
  return content.slice(bodyStart, Math.min(bodyStart + 500, content.length));
}

/**
 * Find the comment/description above a route definition
 */
function extractComment(content: string, lineIndex: number): string | undefined {
  const lines = content.split("\n");
  if (lineIndex <= 0 || lineIndex >= lines.length) return undefined;

  // Look up for comment lines
  const comments: string[] = [];
  for (let i = lineIndex - 1; i >= 0 && i >= lineIndex - 5; i--) {
    const line = lines[i].trim();
    if (line.startsWith("//")) {
      comments.unshift(line.replace(/^\/\/\s*/, ""));
    } else if (line === "" && comments.length === 0) {
      continue;
    } else {
      break;
    }
  }

  return comments.length > 0 ? comments.join(" ") : undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/**
 * Parse routes from a set of scanned files
 */
export function parseRoutes(files: ScannedFile[]): ParsedRoute[] {
  const routes: ParsedRoute[] = [];

  // First pass: find all route mounts from entry files
  const prefixMap = new Map<string, string>(); // relativePath -> prefix
  const varToFile = new Map<string, string>(); // varName -> import source

  for (const file of files) {
    const mounts = extractRouteMounts(file.content);
    const imports = extractImports(file.content);

    for (const mount of mounts) {
      const importSource = imports.get(mount.varName);
      if (importSource) {
        // Resolve relative import to find matching file
        const normalized = importSource.replace(/^\.\//, "").replace(/\.(ts|js|mjs)$/, "");
        for (const f of files) {
          const rel = f.relativePath.replace(/\.(ts|js|mjs)$/, "").replace(/\\/g, "/");
          if (rel.endsWith(normalized) || rel === normalized) {
            prefixMap.set(f.relativePath, mount.prefix);
            break;
          }
        }
      }
    }
  }

  // Second pass: extract routes from each file
  const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
  const methodPattern = methods.join("|");

  for (const file of files) {
    const framework = detectFramework(file.content);
    if (framework === "unknown") continue;

    const prefix = prefixMap.get(file.relativePath) || "";

    // Match route definitions: varName.get("/path", ...)
    const routeRe = new RegExp(
      `(\\w+)\\.(${methodPattern})\\s*\\(\\s*["'\`]([^"'\`]*)["'\`]`,
      "g"
    );

    let m: RegExpExecArray | null;
    while ((m = routeRe.exec(file.content)) !== null) {
      const method = m[2].toUpperCase() as HttpMethod;
      const routePath = m[3];
      const lineNum = getLineNumber(file.content, m.index);

      // Check for zValidator middleware to find schemas
      const afterMatch = file.content.slice(m.index, m.index + 500);
      let bodySchema: ZodSchemaField[] | undefined;
      let querySchema: ZodSchemaField[] | undefined;
      const middleware: string[] = [];

      // Look for zValidator("json", schemaName)
      const zValidatorJsonRe = /zValidator\s*\(\s*["']json["']\s*,\s*(\w+)\s*\)/;
      const zjMatch = zValidatorJsonRe.exec(afterMatch);
      if (zjMatch) {
        bodySchema = parseZodSchema(file.content, zjMatch[1]);
        middleware.push(`zValidator("json", ${zjMatch[1]})`);
      }

      // Look for zValidator("query", schemaName)
      const zValidatorQueryRe = /zValidator\s*\(\s*["']query["']\s*,\s*(\w+)\s*\)/;
      const zqMatch = zValidatorQueryRe.exec(afterMatch);
      if (zqMatch) {
        querySchema = parseZodSchema(file.content, zqMatch[1]);
        middleware.push(`zValidator("query", ${zqMatch[1]})`);
      }

      // Extract path params
      const params = extractPathParams(routePath);

      // Add body schema fields as params
      if (bodySchema) {
        for (const field of bodySchema) {
          params.push({
            name: field.name,
            location: "body",
            type: field.type,
            required: field.required,
            description: field.constraints?.join(", ") || undefined,
          });
        }
      }

      // Extract handler body for response example
      const handlerBody = extractHandlerBody(file.content, m.index);
      const responseExample = extractResponseExample(handlerBody);

      // Extract comment above
      const description = extractComment(file.content, lineNum - 1);

      const fullPath = normalizePath(prefix + "/" + routePath);

      routes.push({
        method,
        path: routePath || "/",
        fullPath,
        file: file.relativePath,
        line: lineNum,
        framework,
        params,
        bodySchema,
        querySchema,
        responseExample,
        description,
        middleware: middleware.length > 0 ? middleware : undefined,
        routePrefix: prefix || undefined,
      });
    }
  }

  return routes;
}

function normalizePath(p: string): string {
  return "/" + p.replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}
