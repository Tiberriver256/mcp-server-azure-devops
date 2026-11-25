import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getCallSites } from 'util';

function getCurrentDir(): string {
  const globalDirname: unknown = Object.getOwnPropertyDescriptor(
    globalThis,
    '__dirname',
  )?.value;
  if (typeof __dirname === 'string' && __dirname !== globalDirname) {
    return __dirname;
  }
  const scriptName = getCallSites(1)[0]?.scriptName;
  if (scriptName) {
    const filePath = scriptName.startsWith('file://')
      ? fileURLToPath(scriptName)
      : scriptName;
    return dirname(filePath);
  }
  return resolve(process.cwd(), 'src/shared/config');
}

function readPackageVersion(): string {
  try {
    const pkgPath = resolve(getCurrentDir(), '../../../package.json');
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
