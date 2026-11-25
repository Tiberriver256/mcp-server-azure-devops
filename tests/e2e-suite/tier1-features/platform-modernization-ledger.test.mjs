import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  REPO_ROOT,
  readRepoFile,
  readRepoJson,
  repoFileExists,
  repoPath,
} from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const requireFromHere = createRequire(import.meta.url);

function registerCleanup(t) {
  const cleanups = [];
  t.after(async () => {
    let firstErr = null;
    for (let i = cleanups.length - 1; i >= 0; i -= 1) {
      try {
        await cleanups[i]();
      } catch (err) {
        if (!firstErr) {
          firstErr = err;
        }
      }
    }
    if (firstErr) {
      throw firstErr;
    }
  });
  return (fn) => {
    cleanups.push(fn);
  };
}

function collectTsFilesRecursive(dirPath) {
  const files = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

describe('Tier 1 — Area 1: Platform Modernization & Shared Ledger (F1, F2, F3, F4, F5, F9)', () => {
  it('T1.1 [F1] Living shared ledger (LEDGER.md) exists at repo root, links from ROADMAP.md, is excluded from npm tarball, and runtime deps stay strictly at 5', () => {
    assert.equal(
      repoFileExists('LEDGER.md'),
      true,
      'Expected LEDGER.md to exist at repository root',
    );
    const ledger = readRepoFile('LEDGER.md');
    assert.ok(
      ledger.length > 1000,
      `Expected LEDGER.md to contain substantial ledger content, got ${ledger.length} chars`,
    );
    assert.match(
      ledger,
      /roadmap|milestone/i,
      'Expected LEDGER.md to track roadmap/milestones',
    );
    assert.match(
      ledger,
      /baseline|metric/i,
      'Expected LEDGER.md to record baseline/verified metrics',
    );
    assert.match(
      ledger,
      /ADR-|architectural decision/i,
      'Expected LEDGER.md to record architectural decisions',
    );
    assert.match(
      ledger,
      /on-prem|server 2019|server 2020|server 2022/i,
      'Expected LEDGER.md to document on-prem quirks',
    );
    assert.match(
      ledger,
      /反省|lesson|reflection|learning/i,
      'Expected LEDGER.md to record lessons learned / reflections',
    );

    const roadmap = readRepoFile('ROADMAP.md');
    assert.ok(
      roadmap.includes('LEDGER.md'),
      'Expected ROADMAP.md to link to LEDGER.md',
    );

    const pkg = readRepoJson('package.json');
    assert.ok(Array.isArray(pkg.files), 'Expected package.json files array');
    for (const requiredEntry of ['dist/', 'docs/', 'LICENSE', 'README.md']) {
      assert.ok(
        pkg.files.includes(requiredEntry),
        `Expected package.json files to include "${requiredEntry}"`,
      );
    }
    for (const excludedEntry of [
      'LEDGER.md',
      '.agents/',
      '.agents',
      'tests/',
      'tests',
    ]) {
      assert.equal(
        pkg.files.includes(excludedEntry),
        false,
        `Expected package.json files NOT to ship "${excludedEntry}" in npm tarball`,
      );
    }
    assert.equal(
      repoFileExists('docs/LEDGER.md'),
      false,
      'LEDGER.md must live at repo root, not inside docs/ (which is shipped in npm tarball)',
    );

    const runtimeDeps = Object.keys(pkg.dependencies ?? {}).sort();
    assert.deepEqual(
      runtimeDeps,
      [
        '@azure/identity',
        '@modelcontextprotocol/sdk',
        'azure-devops-node-api',
        'diff',
        'zod',
      ],
      'Expected strictly 5 runtime dependencies with zero new deps',
    );
  });

  it('T1.2 [F2] Node 24/26 LTS CI matrix, engines.node >=24.0.0, clean-dist build script, and aligned docs', () => {
    const pkg = readRepoJson('package.json');
    assert.match(
      String(pkg.engines?.node ?? ''),
      /^>=\s*24\.\d+\.\d+$/,
      `Expected package.json engines.node >=24.0.0, got ${JSON.stringify(pkg.engines?.node)}`,
    );

    const buildScript = String(pkg.scripts?.build ?? '');
    assert.ok(
      /\b(rmSync|rm)\b/.test(buildScript) &&
        buildScript.includes('dist') &&
        /\btsc\b/.test(buildScript),
      `Expected build script to clean dist/ before invoking tsc, got: ${buildScript}`,
    );

    const ciWorkflow = readRepoFile('.github/workflows/main.yml');
    const matrixLineMatch = /node-version\s*:\s*\[([^\]]+)\]/i.exec(ciWorkflow);
    assert.ok(
      matrixLineMatch,
      'Expected .github/workflows/main.yml to declare a node-version matrix',
    );
    const matrixItems = matrixLineMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    assert.ok(
      matrixItems.some((v) => v === '24' || v.startsWith('24.')),
      `Expected CI node-version matrix to include Node 24, got [${matrixItems.join(', ')}]`,
    );
    assert.ok(
      matrixItems.some((v) => v === '26' || v.startsWith('26.')),
      `Expected CI node-version matrix to include Node 26, got [${matrixItems.join(', ')}]`,
    );
    assert.equal(
      matrixItems.some((v) => v === '22' || v.startsWith('22.')),
      false,
      `Expected CI node-version matrix NOT to pin Node 22, got [${matrixItems.join(', ')}]`,
    );

    for (const docPath of [
      'README.md',
      'CONTRIBUTING.md',
      '.github/copilot-instructions.md',
    ]) {
      const content = readRepoFile(docPath);
      assert.match(
        content,
        /(?:>=\s*24|Node(?:\.?js)?\s+v?24)/i,
        `Expected ${docPath} to document Node 24 requirement`,
      );
      assert.equal(
        />=\s*22\.0\.0/.test(content),
        false,
        `Expected ${docPath} NOT to instruct stale >=22.0.0 requirement`,
      );
      assert.equal(
        /\btsx\s+watch\b/.test(content),
        false,
        `Expected ${docPath} NOT to reference stale "tsx watch"`,
      );
    }
  });

  it('T1.3 [F3] tsconfig.json targets ES2024 with erasableSyntaxOnly: true, preserves CJS output, and src/ has zero TS enums or @/ aliases', () => {
    const tsconfig = readRepoJson('tsconfig.json');
    const compilerOptions = tsconfig.compilerOptions ?? {};
    assert.equal(
      String(compilerOptions.target ?? '').toUpperCase(),
      'ES2024',
      `Expected tsconfig.json target ES2024, got ${JSON.stringify(compilerOptions.target)}`,
    );
    assert.equal(
      compilerOptions.erasableSyntaxOnly,
      true,
      'Expected tsconfig.json compilerOptions.erasableSyntaxOnly === true',
    );
    assert.equal(
      compilerOptions.strict,
      true,
      'Expected tsconfig.json compilerOptions.strict === true',
    );
    assert.match(
      String(compilerOptions.outDir ?? ''),
      /^(?:\.\/)?dist\/?$/,
      `Expected tsconfig.json outDir to target dist, got ${JSON.stringify(compilerOptions.outDir)}`,
    );

    const pkg = readRepoJson('package.json');
    assert.notEqual(
      pkg.type,
      'module',
      'Expected CommonJS dist/ compatibility (package.json type !== "module")',
    );
    assert.equal(
      repoFileExists('dist/index.js'),
      true,
      'Expected compiled dist/index.js to exist',
    );

    const srcFiles = collectTsFilesRecursive(repoPath('src'));
    assert.ok(srcFiles.length > 0, 'Expected TypeScript files under src/');

    const enumViolations = [];
    const aliasViolations = [];
    const enumRe = /^\s*(?:export\s+)?(?:const\s+)?enum\s+\w+/m;
    const aliasRe = /(?:from|import)\s*\(?\s*['"]@\//;

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const rel = path.relative(REPO_ROOT, filePath);
      if (enumRe.test(content)) {
        enumViolations.push(rel);
      }
      if (aliasRe.test(content)) {
        aliasViolations.push(rel);
      }
    }

    assert.deepEqual(
      enumViolations,
      [],
      `Found non-erasable TypeScript enum declarations in src/: ${enumViolations.join(', ')}`,
    );
    assert.deepEqual(
      aliasViolations,
      [],
      `Found @/ path aliases in src/: ${aliasViolations.join(', ')}`,
    );
  });

  it('T1.4 [F4] Inspector script is upgraded to @modelcontextprotocol/inspector@2.16.0 with -- separator', () => {
    const pkg = readRepoJson('package.json');
    const inspector = String(pkg.scripts?.inspector ?? '');
    assert.ok(
      inspector.includes('@modelcontextprotocol/inspector@2.16.0'),
      `Expected inspector script to pin @modelcontextprotocol/inspector@2.16.0, got: ${inspector}`,
    );
    assert.equal(
      inspector.includes('0.9.0'),
      false,
      `Expected inspector script NOT to reference stale 0.9.0, got: ${inspector}`,
    );
    assert.match(
      inspector,
      /@modelcontextprotocol\/inspector@2\.16\.0\s+--\s+node\s+dist\/index\.js/,
      `Expected "-- node dist/index.js" separator in inspector script, got: ${inspector}`,
    );
    assert.ok(
      inspector.includes('npm run build'),
      `Expected inspector script to run build first, got: ${inspector}`,
    );
  });

  it('T1.5 [F5] Test-runner modernization removes Jest/ts-jest/@types/jest/TS6/tsx, wires native node:test + V8 coverage + node --watch, and cleans oxlint.config.mts', () => {
    const pkg = readRepoJson('package.json');
    const deps = pkg.dependencies ?? {};
    const devDeps = pkg.devDependencies ?? {};

    for (const forbidden of ['jest', 'ts-jest', '@types/jest', 'tsx']) {
      assert.equal(
        Object.hasOwn(deps, forbidden),
        false,
        `Expected "${forbidden}" removed from dependencies`,
      );
      assert.equal(
        Object.hasOwn(devDeps, forbidden),
        false,
        `Expected "${forbidden}" removed from devDependencies`,
      );
    }

    if (Object.hasOwn(devDeps, 'typescript')) {
      assert.equal(
        String(devDeps.typescript).includes('typescript6'),
        false,
        `Expected legacy TS 6 compiler alias removed, got: ${devDeps.typescript}`,
      );
    }
    const ts7Spec = String(
      devDeps['@typescript/native'] ?? devDeps.typescript ?? '',
    );
    assert.match(
      ts7Spec,
      /7\./,
      `Expected TypeScript 7.x in devDependencies, got: ${JSON.stringify(ts7Spec)}`,
    );

    const testUnit = String(pkg.scripts?.['test:unit'] ?? '');
    assert.ok(
      /\bnode\b/.test(testUnit) && testUnit.includes('--test'),
      `Expected test:unit to execute native node --test, got: ${testUnit}`,
    );
    assert.equal(
      /\bjest\b/i.test(testUnit),
      false,
      `Expected test:unit NOT to invoke jest, got: ${testUnit}`,
    );

    const coverageScript = String(
      pkg.scripts?.['test:coverage'] ?? pkg.scripts?.['test:unit'] ?? '',
    );
    assert.ok(
      coverageScript.includes('--experimental-test-coverage'),
      `Expected test:coverage (or test:unit) to enable --experimental-test-coverage, got: ${coverageScript}`,
    );
    const linesMatch = /--test-coverage-lines[=\s]+(\d+)/.exec(coverageScript);
    const branchesMatch = /--test-coverage-branches[=\s]+(\d+)/.exec(
      coverageScript,
    );
    const functionsMatch = /--test-coverage-functions[=\s]+(\d+)/.exec(
      coverageScript,
    );
    assert.ok(
      linesMatch && Number.parseInt(linesMatch[1], 10) >= 70,
      `Expected lines coverage threshold >= 70 in coverage script: ${coverageScript}`,
    );
    assert.ok(
      branchesMatch && Number.parseInt(branchesMatch[1], 10) >= 50,
      `Expected branches coverage threshold >= 50 in coverage script: ${coverageScript}`,
    );
    assert.ok(
      functionsMatch && Number.parseInt(functionsMatch[1], 10) >= 60,
      `Expected functions coverage threshold >= 60 in coverage script: ${coverageScript}`,
    );

    const devScript = String(pkg.scripts?.dev ?? '');
    assert.ok(
      /\bnode\b/.test(devScript) && devScript.includes('--watch'),
      `Expected dev script to use native node --watch, got: ${devScript}`,
    );
    assert.equal(
      /\btsx\b/i.test(devScript),
      false,
      `Expected dev script NOT to use tsx, got: ${devScript}`,
    );

    for (const legacyFile of [
      'jest.unit.config.js',
      'jest.int.config.js',
      'jest.e2e.config.js',
      'tsconfig.jest.json',
    ]) {
      assert.equal(
        repoFileExists(legacyFile),
        false,
        `Expected legacy Jest config "${legacyFile}" to be removed`,
      );
    }

    const oxlintCfg = readRepoFile('oxlint.config.mts');
    assert.equal(
      /\bjest\s*:\s*true\b/.test(oxlintCfg),
      false,
      'Expected oxlint.config.mts NOT to enable jest: true environment',
    );
    assert.match(
      oxlintCfg,
      /['"]no-console['"]\s*:\s*['"]error['"]/,
      'Expected oxlint.config.mts to keep no-console error rule',
    );
  });

  it('T1.6 [F5] Pure TypeScript 7.x compiler binary & package-lock.json purged of Jest transitive packages (100% offline)', () => {
    const tscBin = repoPath('node_modules/.bin/tsc');
    assert.equal(
      fs.existsSync(tscBin),
      true,
      'Expected node_modules/.bin/tsc binary to exist',
    );
    const tscVersionOut = execFileSync(tscBin, ['--version'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.match(
      tscVersionOut,
      /Version\s+7\./i,
      `Expected tsc --version to report TypeScript 7.x, got: ${tscVersionOut.trim()}`,
    );
    assert.equal(
      repoFileExists('node_modules/.bin/tsc6'),
      false,
      'Expected legacy node_modules/.bin/tsc6 binary to be absent',
    );

    const lockfile = readRepoJson('package-lock.json');
    const lockPackages = Object.entries(lockfile.packages ?? {});
    const packageKeys = lockPackages.map(([k]) => k);
    const forbiddenSubstrings = [
      'node_modules/jest',
      'node_modules/ts-jest',
      'node_modules/@types/jest',
      'node_modules/tsx',
      'node_modules/babel-plugin-istanbul',
    ];
    for (const needle of forbiddenSubstrings) {
      const offenders = packageKeys.filter((k) => k.includes(needle));
      assert.deepEqual(
        offenders,
        [],
        `Expected package-lock.json to contain zero entries matching "${needle}", found: ${offenders.slice(0, 5).join(', ')}`,
      );
    }
    const ts6Offenders = lockPackages
      .filter(
        ([k, entry]) =>
          k.includes('@typescript/typescript6') ||
          entry?.name === '@typescript/typescript6' ||
          String(entry?.resolved ?? '').includes('@typescript/typescript6'),
      )
      .map(([k]) => k);
    assert.deepEqual(
      ts6Offenders,
      [],
      `Expected package-lock.json to contain zero @typescript/typescript6 entries, found: ${ts6Offenders.join(', ')}`,
    );
  });

  it('T1.7 [F3] Converted as-const enums (AuthenticationMethod, WikiType) preserve exact runtime values in compiled dist/', () => {
    const authMod = requireFromHere(
      repoPath('dist/shared/auth/auth-factory.js'),
    );
    const wikiSchemas = requireFromHere(
      repoPath('dist/features/wikis/schemas.js'),
    );

    assert.ok(
      authMod.AuthenticationMethod &&
        typeof authMod.AuthenticationMethod === 'object',
      'Expected compiled dist/shared/auth/auth-factory.js to export AuthenticationMethod',
    );
    assert.equal(authMod.AuthenticationMethod.PersonalAccessToken, 'pat');
    assert.equal(authMod.AuthenticationMethod.AzureIdentity, 'azure-identity');
    assert.equal(authMod.AuthenticationMethod.AzureCli, 'azure-cli');

    assert.ok(
      wikiSchemas.WikiType && typeof wikiSchemas.WikiType === 'object',
      'Expected compiled dist/features/wikis/schemas.js to export WikiType',
    );
    assert.equal(wikiSchemas.WikiType.CodeWiki, 'codeWiki');
    assert.equal(wikiSchemas.WikiType.ProjectWiki, 'projectWiki');
  });

  it('T1.8 [F2, F3] Compiled dist/index.js boots over stdio, completes initialize + tools/list, and emits zero non-JSON-RPC noise on stdout', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: {
        AZURE_DEVOPS_ORG_URL: mockAdo.url,
        AZURE_DEVOPS_AUTH_METHOD: 'pat',
        AZURE_DEVOPS_PAT: 'test-pat-12345',
        AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
      },
    });
    addCleanup(() => client.close());

    const pkg = readRepoJson('package.json');
    const init = await client.initialize();
    assert.equal(init.serverInfo?.name, 'azure-devops-mcp');
    assert.equal(init.serverInfo?.version, pkg.version);

    const list = await client.listTools();
    assert.ok(
      Array.isArray(list.tools) && list.tools.length >= 75,
      `Expected >= 75 tools in default catalog after M3/M4, got ${list.tools?.length}`,
    );

    client.assertCleanStdout();
    assert.equal(
      mockAdo.requests.length,
      0,
      'Expected startup and tools/list to make zero eager Azure DevOps HTTP calls',
    );
  });

  it('T1.9 [F9] Release Please config, LEDGER.md 19-branch prune record preserving pr-assets/maintenance-overhaul, and explicit non-goals (zero keytar/msal/advsec_)', () => {
    const releaseCfg = readRepoJson('.github/release-please-config.json');
    const rootPkgCfg = releaseCfg.packages?.['.'];
    assert.ok(
      rootPkgCfg && typeof rootPkgCfg === 'object',
      'Expected .github/release-please-config.json packages["."]',
    );
    assert.equal(
      rootPkgCfg['package-name'],
      '@tiberriver256/mcp-server-azure-devops',
    );
    assert.equal(rootPkgCfg['release-type'], 'node');
    assert.equal(rootPkgCfg['bump-minor-pre-major'], true);

    const ledger = readRepoFile('LEDGER.md');
    const ledgerLines = ledger.split(/\r?\n/);
    const count19Pattern = /(?<!\d[.-])\b19\b(?![.-]\d)/;
    const completionVerbPattern = /\b(?:deleted|pruned|removed)\b/i;
    const branchContextPattern = /\b(?:branch(?:es)?|stale)\b/i;
    const preDeletionPattern =
      /(?:^\s*(?:[-*+]|\d+[.)])\s*\[\s*\])|(?:\|\s*\[\s*\])|\b(?:candidates?|approved\s+for\s+m2|planned|pending|to\s+be\s+(?:deleted|pruned|removed)|queued\s+for\s+(?:deletion|m2)|0\s*(?:of|\/)\s*19|not\s+(?:yet\s+)?(?:deleted|pruned|removed))\b/i;
    const hasCompleted19BranchPrune = ledgerLines.some(
      (line) =>
        count19Pattern.test(line) &&
        completionVerbPattern.test(line) &&
        branchContextPattern.test(line) &&
        !preDeletionPattern.test(line),
    );
    assert.equal(
      hasCompleted19BranchPrune,
      true,
      'Expected LEDGER.md to contain a completed line recording the 19 deleted/pruned/removed stale remote branches (not merely a pre-M2 candidate/planned/unchecked entry)',
    );
    assert.match(
      ledger,
      /bugfix\/95--length-issue|pr-246/,
      'Expected LEDGER.md to list concrete deleted stale branch names',
    );
    assert.ok(
      ledger.includes('pr-assets/maintenance-overhaul'),
      'Expected LEDGER.md to record preservation of pr-assets/maintenance-overhaul',
    );
    assert.match(
      ledger,
      /0\.2\.0/,
      'Expected LEDGER.md to document 0.2.0 release target',
    );

    // Explicit non-goals check: zero keytar or msal packages in package.json
    const pkg = readRepoJson('package.json');
    const allDepNames = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ];
    const forbiddenNonGoalDeps = allDepNames.filter((name) =>
      /(?:keytar|msal)/i.test(name),
    );
    assert.deepEqual(
      forbiddenNonGoalDeps,
      [],
      `Expected zero keytar/msal packages in package.json, found: ${forbiddenNonGoalDeps.join(', ')}`,
    );

    // Explicit non-goals check: zero advsec_ tools in src/
    const srcFiles = collectTsFilesRecursive(repoPath('src'));
    const advsecHits = [];
    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/\badvsec_[a-z0-9_]+\b/i.test(content)) {
        advsecHits.push(path.relative(REPO_ROOT, filePath));
      }
    }
    assert.deepEqual(
      advsecHits,
      [],
      `Expected zero advsec_* non-goal tool references in src/, found in: ${advsecHits.join(', ')}`,
    );
  });
});
