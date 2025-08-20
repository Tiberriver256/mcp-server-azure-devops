import { WebApi } from 'azure-devops-node-api';

/**
 * Get code coverage summary for a build
 */
export async function getCodeCoverage(
  connection: WebApi,
  options: {
    projectId?: string;
    buildId: number;
    flags?: number;
  },
): Promise<{
  coverageData: Array<{
    buildFlavor?: string;
    buildPlatform?: string;
    coverageStats?: Array<{
      label?: string;
      position?: number;
      total?: number;
      covered?: number;
      isDeltaAvailable?: boolean;
      delta?: number;
    }>;
  }>;
  build?: {
    id?: string;
    url?: string;
  };
}> {
  const testApi = await connection.getTestApi();
  const projectId = options.projectId ?? 'CCTV';

  const coverage = await testApi.getBuildCodeCoverage(
    projectId,
    options.buildId,
    options.flags,
  );

  return {
    coverageData: coverage.map((c) => ({
      buildFlavor: c.buildFlavor,
      buildPlatform: c.buildPlatform,
      coverageStats: c.coverageStats?.map((stat) => ({
        label: stat.label,
        position: stat.position,
        total: stat.total,
        covered: stat.covered,
        isDeltaAvailable: stat.isDeltaAvailable,
        delta: stat.delta,
      })),
    })),
    build: coverage[0]?.build
      ? {
          id: coverage[0].build.id,
          url: coverage[0].build.url,
        }
      : undefined,
  };
}

/**
 * Get detailed code coverage data for a build
 */
export async function getCodeCoverageDetails(
  connection: WebApi,
  options: {
    projectId?: string;
    buildId: number;
    flags?: number;
    top?: number;
    continuationToken?: string;
  },
): Promise<{
  modules?: Array<{
    name?: string;
    signature?: string;
    statistics?: {
      blocksCovered?: number;
      blocksNotCovered?: number;
      linesCovered?: number;
      linesNotCovered?: number;
      linesPartiallyCovered?: number;
    };
    functions?: Array<{
      name?: string;
      signature?: string;
      statistics?: {
        blocksCovered?: number;
        blocksNotCovered?: number;
        linesCovered?: number;
        linesNotCovered?: number;
        linesPartiallyCovered?: number;
      };
    }>;
  }>;
  continuationToken?: string;
}> {
  const testApi = await connection.getTestApi();
  const projectId = options.projectId ?? 'CCTV';

  // Note: The Azure DevOps API for detailed coverage is not well documented
  // This is a best-effort implementation based on the API surface
  const coverage = await testApi.getBuildCodeCoverage(
    projectId,
    options.buildId,
    options.flags,
  );

  // Parse detailed coverage if available
  if (coverage && coverage.length > 0 && (coverage as any).modules) {
    const modules = (coverage as any).modules;
    return {
      modules: modules.map((m: any) => ({
        name: m.name,
        signature: m.signature,
        statistics: m.statistics,
        functions: m.functions?.map((f: any) => ({
          name: f.name,
          signature: f.signature,
          statistics: f.statistics,
        })),
      })),
      continuationToken: options.continuationToken,
    };
  }

  return {};
}
