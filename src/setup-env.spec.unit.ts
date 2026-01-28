import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'fs';
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

  it('skips extension install when azure-devops is already present', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'setup-env-'));
    const binDir = join(tempDir, 'bin');
    mkdirSync(binDir);
    const scriptPath = join(process.cwd(), 'setup_env.sh');

    const azPath = join(binDir, 'az');
    writeFileSync(
      azPath,
      `#!/bin/bash
case "$1" in
  devops)
    echo "Missing command" >&2
    exit 2
    ;;
  extension)
    if [ "$2" = "show" ]; then
      echo "azure-devops"
      exit 0
    fi
    if [ "$2" = "add" ]; then
      echo "unexpected extension add" >&2
      exit 42
    fi
    ;;
  account)
    exit 0
    ;;
  rest)
    if echo "$*" | grep -q "profiles/me"; then
      echo '{"publicAlias":"unit-alias"}'
      exit 0
    fi
    if echo "$*" | grep -q "accounts?memberId=unit-alias"; then
      echo '{"value":[{"accountName":"org-one"}]}'
      exit 0
    fi
    ;;
esac
echo "unexpected az call: $*" >&2
exit 3
`,
      { mode: 0o755 },
    );
    chmodSync(azPath, 0o755);

    const jqPath = join(binDir, 'jq');
    writeFileSync(
      jqPath,
      `#!/bin/bash
if [ "$1" != "-r" ]; then
  exit 2
fi
case "$2" in
  .publicAlias)
    echo "unit-alias"
    ;;
  .value[].accountName)
    echo "org-one"
    ;;
  *)
    exit 1
    ;;
esac
`,
      { mode: 0o755 },
    );
    chmodSync(jqPath, 0o755);

    const result = spawnSync('bash', [scriptPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
      },
      input: '1\nn\nn\n',
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
  });

  it('extracts org name when user pastes a dev.azure.com URL', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'setup-env-'));
    const binDir = join(tempDir, 'bin');
    mkdirSync(binDir);
    const scriptPath = join(process.cwd(), 'setup_env.sh');

    const azPath = join(binDir, 'az');
    writeFileSync(
      azPath,
      `#!/bin/bash
case "$1" in
  extension)
    if [ "$2" = "show" ]; then
      echo "azure-devops"
      exit 0
    fi
    if [ "$2" = "add" ]; then
      echo "unexpected extension add" >&2
      exit 42
    fi
    ;;
  account)
    exit 0
    ;;
  rest)
    exit 1
    ;;
esac
echo "unexpected az call: $*" >&2
exit 3
`,
      { mode: 0o755 },
    );
    chmodSync(azPath, 0o755);

    const jqPath = join(binDir, 'jq');
    writeFileSync(
      jqPath,
      `#!/bin/bash
exit 0
`,
      { mode: 0o755 },
    );
    chmodSync(jqPath, 0o755);

    const result = spawnSync('bash', [scriptPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
      },
      input:
        'https://dev.azure.com/azure-devops-mcp-testing/\n' + 'n\n' + 'n\n',
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);

    const envFile = readFileSync(join(tempDir, '.env'), 'utf8');
    expect(envFile).toContain('AZURE_DEVOPS_ORG=azure-devops-mcp-testing');
    expect(envFile).toContain(
      'AZURE_DEVOPS_ORG_URL=https://dev.azure.com/azure-devops-mcp-testing',
    );
  });
});
