import { ApiDoc, RouteGroup } from "./generator";
import { ParsedRoute, ZodSchemaField } from "./parser";

/**
 * Format docs as colored terminal output
 */
export function formatTerminal(doc: ApiDoc): string {
  const lines: string[] = [];
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";
  const DIM = "\x1b[2m";
  const GREEN = "\x1b[32m";
  const BLUE = "\x1b[34m";
  const YELLOW = "\x1b[33m";
  const CYAN = "\x1b[36m";
  const RED = "\x1b[31m";
  const MAGENTA = "\x1b[35m";
  const WHITE = "\x1b[37m";

  const methodColors: Record<string, string> = {
    GET: GREEN,
    POST: BLUE,
    PUT: YELLOW,
    PATCH: MAGENTA,
    DELETE: RED,
    OPTIONS: DIM,
    HEAD: DIM,
  };

  lines.push("");
  lines.push(`${BOLD}${CYAN}  API Documentation: ${doc.projectName}${RESET}`);
  lines.push(`${DIM}  Framework: ${doc.framework} | Routes: ${doc.totalRoutes} | Generated: ${doc.generatedAt}${RESET}`);
  lines.push("");

  for (const group of doc.groups) {
    lines.push(`${BOLD}${WHITE}  --- ${group.name} ${DIM}(${group.prefix})${RESET}`);
    lines.push("");

    for (const route of group.routes) {
      const color = methodColors[route.method] || WHITE;
      const methodPad = route.method.padEnd(7);
      lines.push(`  ${color}${BOLD}${methodPad}${RESET} ${route.fullPath}`);

      if (route.description) {
        lines.push(`${DIM}          ${route.description}${RESET}`);
      }

      // Path params
      const pathParams = route.params.filter(p => p.location === "path");
      if (pathParams.length > 0) {
        lines.push(`${DIM}          Params: ${pathParams.map(p => `:${p.name}`).join(", ")}${RESET}`);
      }

      // Body schema
      if (route.bodySchema && route.bodySchema.length > 0) {
        lines.push(`${DIM}          Body:${RESET}`);
        for (const field of route.bodySchema) {
          const req = field.required ? `${RED}*${RESET}` : "";
          const def = field.defaultValue ? ` ${DIM}(default: ${field.defaultValue})${RESET}` : "";
          const enums = field.enumValues ? ` ${DIM}[${field.enumValues.join("|")}]${RESET}` : "";
          const constraints = field.constraints ? ` ${DIM}(${field.constraints.join(", ")})${RESET}` : "";
          lines.push(`${DIM}            ${CYAN}${field.name}${RESET}${req}: ${field.type}${enums}${constraints}${def}`);
        }
      }

      // File location
      lines.push(`${DIM}          -> ${route.file}:${route.line}${RESET}`);
      lines.push("");
    }
  }

  lines.push(`${DIM}  Total: ${doc.totalRoutes} endpoints across ${doc.groups.length} groups${RESET}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Format docs as JSON
 */
export function formatJson(doc: ApiDoc): string {
  return JSON.stringify(doc, null, 2);
}
