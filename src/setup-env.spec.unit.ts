import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

describe('setup_env.sh', () => {
  it('writes PAT and auth method in non-interactive mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'setup-env-'));
    const scriptPath = join(process.cwd(), 'setup_env.sh');

    const result = spawnSync('bash', [scriptPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        SETUP_ENV_NONINTERACTIVE: '1',
        SETUP_ENV_ORG_NAME: 'unit-test-org',
        AZURE_DEVOPS_PAT: 'unit-test-pat',
        AZURE_DEVOPS_DEFAULT_PROJECT: 'unit-project',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);

    const envFile = readFileSync(join(tempDir, '.env'), 'utf8');
    expect(envFile).toContain('AZURE_DEVOPS_PAT=unit-test-pat');
    expect(envFile).toContain('AZURE_DEVOPS_AUTH_METHOD=pat');
    expect(envFile).toContain(
      'AZURE_DEVOPS_ORG_URL=https://dev.azure.com/unit-test-org',
    );
  });
});
