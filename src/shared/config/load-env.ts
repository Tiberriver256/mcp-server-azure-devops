/**
 * Zero-dependency .env loader backed by Node.js 22 native process.loadEnvFile().
 * Preserves existing process.env values (same precedence as dotenv) and
 * silently ignores missing .env files.
 */
export function loadEnvFile(filePath?: string): boolean {
  try {
    if (filePath !== undefined) {
      process.loadEnvFile(filePath);
    } else {
      process.loadEnvFile();
    }
    return true;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}
