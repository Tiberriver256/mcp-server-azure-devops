import { readFileSync } from 'fs';
import { resolve } from 'path';

function readPackageVersion(): string {
  try {
    const pkgPath = resolve(__dirname, '../../../package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      typeof parsed.version === 'string' &&
      parsed.version.length > 0
    ) {
      return parsed.version;
    }
  } catch {
    // Fallback when running outside standard package layout
  }
  return '0.0.0';
}

/**
 * Current version of the Azure DevOps MCP Server, sourced from package.json.
 */
export const VERSION: string = readPackageVersion();
