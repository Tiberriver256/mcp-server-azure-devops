import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthenticationMethod } from '../../shared/auth/index.ts';
import {
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors/index.ts';
import { createHttpClient, HttpError } from '../../shared/http/http-client.ts';
import type {
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from '../../shared/http/http-client.ts';
import { createAzureDevOpsSession } from '../../shared/session/azure-devops-session.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import {
  analyticsFeature,
  analyticsTools,
  compileAnalyticsMetricPreset,
  getAnalyticsMetrics,
  getAnalyticsSchema,
  queryAnalytics,
} from './index.ts';

interface RecordedRequest {
  method: string;
  url: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
}

function createMockToolContext(
  responder: (req: RecordedRequest) => HttpResponse<unknown>,
  overrides: {
    organizationUrl?: string;
    defaultProject?: string;
  } = {},
): { ctx: ToolContext; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const request = async <T = unknown>(
    options: HttpRequestOptions,
  ): Promise<HttpResponse<T>> => {
    const rec: RecordedRequest = {
      method: options.method ?? 'GET',
      url: options.url,
      query: options.query,
      headers: options.headers,
      body: options.body,
    };
    requests.push(rec);
    return (await Promise.resolve(responder(rec))) as HttpResponse<T>;
  };

  const httpClient: HttpClient = {
    request,
    get: <T = unknown>(
      url: string,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => request<T>({ ...opts, method: 'GET', url }),
    post: <T = unknown>(
      url: string,
      body?: unknown,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => request<T>({ ...opts, method: 'POST', url, body }),
    put: <T = unknown>(
      url: string,
      body?: unknown,
      opts?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => request<T>({ ...opts, method: 'PUT', url, body }),
  };

  const ctx = createAzureDevOpsSession(
    {
      organizationUrl:
        overrides.organizationUrl ?? 'https://dev.azure.com/myorg',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'test-pat-12345',
      defaultProject: overrides.defaultProject ?? 'DemoProject',
    },
    { httpClient },
  );

  return { ctx, requests };
}

const SAMPLE_METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="Microsoft.VisualStudio.Services.Analytics.Model" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="WorkItem">
        <Key><PropertyRef Name="WorkItemId" /></Key>
        <Property Name="WorkItemId" Type="Edm.Int32" Nullable="false" />
        <Property Name="CycleTimeDays" Type="Edm.Double" />
        <Property Name="Custom_Team" Type="Edm.String" />
        <Property Name="Custom_RiskScore" Type="Edm.Int32" />
        <NavigationProperty Name="Area" Type="Microsoft.VisualStudio.Services.Analytics.Model.Area" />
        <NavigationProperty Name="Iteration" Type="Microsoft.VisualStudio.Services.Analytics.Model.Iteration" />
        <NavigationProperty Name="AssignedTo" Type="Microsoft.VisualStudio.Services.Analytics.Model.User" />
      </EntityType>
      <EntityType Name="WorkItemSnapshot">
        <Key><PropertyRef Name="DateSK" /></Key>
        <Property Name="DateSK" Type="Edm.Int32" Nullable="false" />
      </EntityType>
      <EntityContainer Name="Analytics">
        <EntitySet Name="WorkItems" EntityType="Microsoft.VisualStudio.Services.Analytics.Model.WorkItem" />
        <EntitySet Name="WorkItemSnapshot" EntityType="Microsoft.VisualStudio.Services.Analytics.Model.WorkItemSnapshot" />
        <EntitySet Name="PipelineRuns" EntityType="Microsoft.VisualStudio.Services.Analytics.Model.PipelineRun" />
        <EntitySet Name="TestResultsDaily" EntityType="Microsoft.VisualStudio.Services.Analytics.Model.TestResultDaily" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

void describe('Analytics feature module & handlers', () => {
  void it('exports analyticsFeature and 3 read-only tools with full annotations and security/lag caveats', () => {
    assert.equal(analyticsFeature.toolset, 'analytics');
    assert.equal(analyticsFeature.tools, analyticsTools);
    assert.deepEqual(analyticsTools.map((t) => t.name).sort(), [
      'get_analytics_metrics',
      'get_analytics_schema',
      'query_analytics',
    ]);

    for (const tool of analyticsTools) {
      assert.equal(tool.readOnly, true);
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.destructiveHint, false);
      assert.equal(tool.annotations.idempotentHint, true);
      assert.equal(tool.annotations.openWorldHint, true);

      const def = tool.toDefinition();
      assert.ok(def.inputSchema && typeof def.inputSchema === 'object');
    }

    const queryTool = analyticsTools.find((t) => t.name === 'query_analytics');
    assert.ok(queryTool);
    assert.match(queryTool.description, /no area-path-level security/i);
    assert.match(queryTool.description, /eventual consistency lag/i);
  });

  void it('get_analytics_schema lists entity sets and inspects a specific entitySet with Custom_* fields', async () => {
    const { ctx, requests } = createMockToolContext(() => ({
      status: 200,
      headers: { 'content-type': 'application/xml' },
      data: SAMPLE_METADATA_XML,
    }));

    const summary = await getAnalyticsSchema(ctx, {
      projectId: 'DemoProject',
      scope: 'project',
      version: 'v3.0-preview',
    });
    assert.ok('entitySets' in summary);
    assert.equal(summary.entitySetCount, 4);
    const snapshot = summary.entitySets.find(
      (es) => es.name === 'WorkItemSnapshot',
    );
    assert.equal(snapshot?.isSnapshot, true);
    assert.equal(snapshot?.requiresAggregation, true);
    assert.equal(
      requests[0].url,
      'https://analytics.dev.azure.com/myorg/DemoProject/_odata/v3.0-preview/$metadata',
    );

    const detail = await getAnalyticsSchema(ctx, {
      projectId: 'DemoProject',
      scope: 'project',
      version: 'v3.0-preview',
      entitySet: 'WorkItems',
    });
    assert.ok('properties' in detail);
    assert.equal(detail.entitySet, 'WorkItems');
    assert.deepEqual(
      detail.customProperties.map((p) => p.name),
      ['Custom_Team', 'Custom_RiskScore'],
    );
    assert.deepEqual(
      detail.navigationProperties.map((n) => n.name),
      ['Area', 'Iteration', 'AssignedTo'],
    );

    // Unknown entitySet in metadata returns ResourceNotFoundError listing available sets
    await assert.rejects(
      () =>
        getAnalyticsSchema(ctx, {
          projectId: 'DemoProject',
          scope: 'project',
          version: 'v3.0-preview',
          entitySet: 'NonExistentSet',
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('query_analytics executes project-scoped, org-scoped, and on-prem Server queries', async () => {
    const { ctx, requests } = createMockToolContext(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: {
        '@odata.context':
          'https://analytics.dev.azure.com/myorg/DemoProject/_odata/v3.0-preview/$metadata#WorkItems',
        '@odata.count': 2,
        value: [{ WorkItemId: 101, State: 'Active' }],
      },
    }));

    const res = await queryAnalytics(ctx, {
      entitySet: 'WorkItems',
      projectId: 'DemoProject',
      scope: 'project',
      version: 'v3.0-preview',
      select: ['WorkItemId', 'State'],
      filter: "State eq 'Active'",
      orderby: 'WorkItemId asc',
      top: 1,
      count: true,
    });

    assert.equal(res['@odata.count'], 2);
    assert.equal(res.returnedCount, 1);
    assert.equal(res.value[0].WorkItemId, 101);
    assert.equal(
      requests[0].url,
      'https://analytics.dev.azure.com/myorg/DemoProject/_odata/v3.0-preview/WorkItems',
    );
    assert.equal(requests[0].query?.$count, 'true');
    assert.equal(requests[0].query?.$top, 1);

    // Org-scoped omits project segment even when defaultProject is set
    await queryAnalytics(ctx, {
      entitySet: 'WorkItems',
      scope: 'organization',
      version: 'v3.0-preview',
      select: ['WorkItemId'],
    });
    assert.equal(
      requests[1].url,
      'https://analytics.dev.azure.com/myorg/_odata/v3.0-preview/WorkItems',
    );

    // On-prem Server routes to collection base URL
    const serverMock = createMockToolContext(
      () => ({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { value: [] },
      }),
      { organizationUrl: 'https://ado.corp:8080/tfs/DefaultCollection' },
    );
    await queryAnalytics(serverMock.ctx, {
      entitySet: 'WorkItems',
      scope: 'project',
      version: 'v3.0-preview',
    });
    assert.equal(
      serverMock.requests[0].url,
      'https://ado.corp:8080/tfs/DefaultCollection/DemoProject/_odata/v3.0-preview/WorkItems',
    );
    // Injected safe default $select
    assert.ok(
      typeof serverMock.requests[0].query?.$select === 'string' &&
        serverMock.requests[0].query.$select.includes('WorkItemId'),
    );
  });

  void it('query_analytics upgrades >2,800-char GET queries to single-op POST $batch', async () => {
    const respBoundary = 'batchresponse_unit_test';
    const { ctx, requests } = createMockToolContext(() => ({
      status: 200,
      headers: {
        'content-type': `multipart/mixed; boundary=${respBoundary}`,
      },
      data:
        `--${respBoundary}\r\n` +
        `Content-Type: application/http\r\n` +
        `Content-Transfer-Encoding: binary\r\n\r\n` +
        `HTTP/1.1 200 OK\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `{"value":[{"WorkItemId":101,"Title":"Batch Result"}]}\r\n` +
        `--${respBoundary}--\r\n`,
    }));

    const longFilter = Array.from(
      { length: 180 },
      (_, idx) => `WorkItemId eq ${101 + idx}`,
    ).join(' or ');

    const res = await queryAnalytics(ctx, {
      entitySet: 'WorkItems',
      projectId: 'DemoProject',
      scope: 'project',
      version: 'v3.0-preview',
      select: ['WorkItemId', 'Title'],
      filter: longFilter,
    });

    assert.equal(res.usedBatch, true);
    assert.equal(res.value[0].WorkItemId, 101);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'POST');
    assert.equal(
      requests[0].url,
      'https://analytics.dev.azure.com/myorg/DemoProject/_odata/v3.0-preview/$batch',
    );
    const body = String(requests[0].body ?? '');
    assert.equal((body.match(/^GET\s+/gm) ?? []).length, 1);
  });

  void it('query_analytics strips cross-origin @odata.nextLink and blocks untrusted nextLink input before HTTP', async () => {
    const { ctx, requests } = createMockToolContext(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: {
        '@odata.nextLink': 'https://evil.example/steal?token=1',
        value: [{ WorkItemId: 101 }],
      },
    }));

    const res = await queryAnalytics(ctx, {
      entitySet: 'WorkItems',
      projectId: 'DemoProject',
      scope: 'project',
      version: 'v3.0-preview',
      select: ['WorkItemId'],
    });
    assert.equal(res['@odata.nextLink'], undefined);
    assert.equal(res.nextLinkBlocked, true);
    assert.ok(res.warnings && res.warnings.length === 1);
    assert.ok(!JSON.stringify(res).includes('evil.example'));
    assert.equal(requests.length, 1);

    // Direct cross-origin nextLink input rejected with zero HTTP calls
    await assert.rejects(
      () =>
        queryAnalytics(ctx, {
          entitySet: 'WorkItems',
          projectId: 'DemoProject',
          scope: 'project',
          version: 'v3.0-preview',
          nextLink: 'https://evil.example/steal',
        }),
      AzureDevOpsValidationError,
    );
    assert.equal(requests.length, 1);
  });

  void it('query_analytics surfaces actionable 403/404 Analytics guidance', async () => {
    const { ctx } = createMockToolContext(() => {
      throw new HttpError({
        message: 'Forbidden',
        status: 403,
        statusText: 'Forbidden',
        url: 'https://analytics.dev.azure.com/myorg/DemoProject/_odata/v3.0-preview/WorkItems',
        responseData: {
          error: { code: 'VS403483', message: 'View analytics required' },
        },
      });
    });

    await assert.rejects(
      () =>
        queryAnalytics(ctx, {
          entitySet: 'WorkItems',
          scope: 'project',
          version: 'v3.0-preview',
        }),
      (err: unknown) =>
        err instanceof AzureDevOpsPermissionError &&
        /View analytics/i.test(err.message) &&
        /vso\.analytics/i.test(err.message),
    );
  });

  void it('get_analytics_metrics compiles and runs all 6 curated $apply presets cleanly', async () => {
    const fixedNow = new Date('2026-11-25T12:00:00Z');
    const presets = [
      'pipeline_pass_rate',
      'pipeline_duration_percentiles',
      'flaky_tests',
      'failed_tests',
      'work_item_cycle_time',
      'work_item_counts',
    ] as const;

    for (const metric of presets) {
      const compiled = compileAnalyticsMetricPreset(
        {
          metric,
          scope: 'project',
          version: 'v3.0-preview',
          days: 14,
          pipelineName: "CI'Main",
          branchName: 'refs/heads/main',
          workflow: 'Build',
          workItemType: 'User Story',
          areaPath: 'DemoProject\\Backend',
          iterationPath: 'DemoProject\\Sprint 2',
        },
        fixedNow,
      );
      assert.ok(compiled.apply.includes('groupby('));
      assert.ok(compiled.apply.includes('aggregate('));
      // Ensure single quotes are safely escaped when pipelineName is embedded
      if (compiled.apply.includes('CI')) {
        assert.ok(compiled.apply.includes("'CI''Main'"));
      }
    }

    // Verify end-to-end enrichment on pipeline_pass_rate
    const { ctx, requests } = createMockToolContext(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: {
        value: [
          {
            Pipeline: { PipelineId: 10, PipelineName: 'CI-Main' },
            TotalRuns: 2,
            SucceededRuns: 1,
            FailedRuns: 1,
            PartiallySucceededRuns: 0,
            CanceledRuns: 0,
          },
        ],
      },
    }));

    const result = await getAnalyticsMetrics(ctx, {
      metric: 'pipeline_pass_rate',
      projectId: 'DemoProject',
      scope: 'project',
      version: 'v3.0-preview',
    });

    assert.equal(result.entitySet, 'PipelineRuns');
    assert.equal(result.value[0].PassRatePercent, 50);
    assert.equal(requests.length, 1);
    assert.ok(typeof requests[0].query?.$apply === 'string');
  });

  void it('executes RegisteredTool end-to-end via createHttpClient and percent-encodes +08:00 as %2B08 on wire', async () => {
    const fetchedUrls: string[] = [];
    const fetchedAuthHeaders: string[] = [];

    const httpClient = createHttpClient({
      fetchFn: async (input: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        fetchedUrls.push(urlStr);
        const headers = init?.headers as Record<string, string> | undefined;
        if (headers?.Authorization) {
          fetchedAuthHeaders.push(headers.Authorization);
        }
        return new Response(
          JSON.stringify({
            value: [{ WorkItemId: 102, ChangedDate: '2026-11-22T14:00:00Z' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    });

    const ctx = createAzureDevOpsSession(
      {
        organizationUrl: 'https://dev.azure.com/myorg',
        authMethod: AuthenticationMethod.PersonalAccessToken,
        personalAccessToken: 'wire-test-pat',
        defaultProject: 'DemoProject',
      },
      { httpClient },
    );

    const queryTool = analyticsTools.find((t) => t.name === 'query_analytics');
    assert.ok(queryTool);

    const mcpResult = await queryTool.execute(ctx, {
      entitySet: 'WorkItems',
      select: ['WorkItemId', 'ChangedDate'],
      filter: 'ChangedDate ge 2026-11-22T00:00:00+08:00',
      scope: 'organization',
    });

    assert.equal(fetchedUrls.length, 1);
    assert.match(
      fetchedUrls[0],
      /^https:\/\/analytics\.dev\.azure\.com\/myorg\/_odata\/v3\.0-preview\/WorkItems\?/,
    );
    assert.match(fetchedUrls[0], /%2B08/i);
    assert.equal(fetchedAuthHeaders.length, 1);
    assert.match(fetchedAuthHeaders[0], /^Basic /);

    const parsed = JSON.parse(mcpResult.content[0].text);
    assert.equal(parsed.value[0].WorkItemId, 102);

    // Schema-level top > 1000 rejected before fetch
    await assert.rejects(() =>
      queryTool.execute(ctx, {
        entitySet: 'WorkItems',
        top: 50000,
      }),
    );
    assert.equal(fetchedUrls.length, 1);
  });
});
