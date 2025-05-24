import dotenv from 'dotenv';
import path from 'path';

export const loadEnvironment = () => {
  // Attempt to load .env.test from the project root
  // Adjust path if your structure is different or if tests run from a different CWD
  const envPath = path.resolve(process.cwd(), '.env.test');
  dotenv.config({ path: envPath });

  // Fallback to .env if .env.test is not found or doesn't contain all vars
  const fallbackEnvPath = path.resolve(process.cwd(), '.env');
  if (!process.env.AZURE_ORG || !process.env.AZURE_PROJECT || !process.env.AZURE_DEVOPS_PAT) {
    dotenv.config({ path: fallbackEnvPath, override: false }); // Do not override if already set by .env.test
  }
};
