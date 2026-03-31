import { ParsedRoute } from "./parser";

export interface ApiDoc {
  projectName: string;
  generatedAt: string;
  framework: string;
  totalRoutes: number;
  groups: RouteGroup[];
}

export interface RouteGroup {
  name: string;
  prefix: string;
  routes: ParsedRoute[];
}

/**
 * Generate structured API documentation from parsed routes
 */
export function generateDocs(routes: ParsedRoute[], projectName: string): ApiDoc {
  // Detect primary framework
  const frameworkCounts = new Map<string, number>();
  for (const r of routes) {
    frameworkCounts.set(r.framework, (frameworkCounts.get(r.framework) || 0) + 1);
  }
  let primaryFramework = "unknown";
  let maxCount = 0;
  for (const [fw, count] of frameworkCounts) {
    if (count > maxCount) {
      primaryFramework = fw;
      maxCount = count;
    }
  }

  // Group routes by file or prefix
  const groupMap = new Map<string, ParsedRoute[]>();
  for (const route of routes) {
    const key = route.routePrefix || route.file;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(route);
  }

  const groups: RouteGroup[] = [];
  for (const [key, groupRoutes] of groupMap) {
    // Sort routes: GET first, then alphabetically
    groupRoutes.sort((a, b) => {
      const methodOrder: Record<string, number> = {
        GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4, OPTIONS: 5, HEAD: 6,
      };
      const diff = (methodOrder[a.method] || 9) - (methodOrder[b.method] || 9);
      if (diff !== 0) return diff;
      return a.fullPath.localeCompare(b.fullPath);
    });

    // Derive a friendly group name
    const name = deriveGroupName(key);
    const prefix = groupRoutes[0]?.routePrefix || key;

    groups.push({ name, prefix, routes: groupRoutes });
  }

  // Sort groups alphabetically
  groups.sort((a, b) => a.name.localeCompare(b.name));

  return {
    projectName,
    generatedAt: new Date().toISOString(),
    framework: primaryFramework,
    totalRoutes: routes.length,
    groups,
  };
}

function deriveGroupName(key: string): string {
  // If it's a path prefix like "/api/videos", take the last segment
  if (key.startsWith("/")) {
    const segments = key.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "root";
    return capitalize(last);
  }

  // If it's a file path, use the filename without extension
  const parts = key.replace(/\\/g, "/").split("/");
  const filename = parts[parts.length - 1] || "unknown";
  return capitalize(filename.replace(/\.(ts|js|mjs|cjs)$/, "").replace(/[_-]/g, " "));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
