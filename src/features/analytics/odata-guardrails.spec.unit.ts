import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsRateLimitError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors/index.ts';
import { HttpError, buildRequestUrl } from '../../shared/http/http-client.ts';
import {
  buildODataBaseUrl,
  buildODataQueryParams,
  buildSingleOpBatchPayload,
  findDateTimeWithoutTimezone,
  mapAnalyticsHttpError,
  parseSingleOpBatchResponse,
  validateAnalyticsQuery,
  validateEntitySet,
  validateMetadataEntitySetName,
  validateSameOriginNextLink,
} from './odata-guardrails.ts';
import { SNAPSHOT_ENTITY_SETS } from './types.ts';

void describe('OData Analytics Poka-Yoke Guardrails', () => {
  void it('Guard #1: validates entitySet allowlist and blocks key addressing & path traversal', () => {
    assert.equal(validateEntitySet('WorkItems'), 'WorkItems');
    assert.equal(validateEntitySet('workitems'), 'WorkItems');
    assert.equal(validateEntitySet('  TestResultsDaily  '), 'TestResultsDaily');

    for (const bad of [
      '',
      '   ',
      'WorkItems(123)',
      'WorkItems(123)/AssignedTo',
      '../Areas',
      'WorkItems?$top=1',
      'WorkItems#frag',
      'Work Items',
      'UnknownEntitySet',
    ]) {
      assert.throws(
        () => validateEntitySet(bad),
        (err: unknown) =>
          err instanceof AzureDevOpsValidationError &&
          /entitySet|invalid|blocked|allowed|VS403483/i.test(err.message),
        `Expected entitySet "${bad}" to be rejected`,
      );
    }

    assert.equal(validateMetadataEntitySetName('CustomEntity'), 'CustomEntity');
    assert.throws(
      () => validateMetadataEntitySetName('../Areas'),
      AzureDevOpsValidationError,
    );
  });

  void it('Guard #2: blocks non-aggregated queries on every *Snapshot entity set', () => {
    for (const snapshot of SNAPSHOT_ENTITY_SETS) {
      assert.throws(
        () => validateAnalyticsQuery({ entitySet: snapshot }),
        (err: unknown) =>
          err instanceof AzureDevOpsValidationError &&
          /VS403483/i.test(err.message) &&
          /apply|aggregat/i.test(err.message),
      );

      // Filter-only $apply without aggregate() is still rejected
      assert.throws(
        () =>
          validateAnalyticsQuery({
            entitySet: snapshot,
            apply: "filter(State eq 'Active')",
          }),
        AzureDevOpsValidationError,
      );

      // Aggregated $apply passes cleanly
      const valid = validateAnalyticsQuery({
        entitySet: snapshot,
        apply: 'groupby((DateSK),aggregate($count as Count))',
      });
      assert.equal(valid.entitySet, snapshot);
    }
  });

  void it('Guard #3: blocks $expand containing Revisions on WorkItems', () => {
    assert.throws(
      () =>
        validateAnalyticsQuery({
          entitySet: 'WorkItems',
          expand: 'Revisions',
        }),
      (err: unknown) =>
        err instanceof AzureDevOpsValidationError &&
        /WorkItemRevisions/i.test(err.message) &&
        /VS403483/i.test(err.message),
    );

    assert.throws(
      () =>
        validateAnalyticsQuery({
          entitySet: 'WorkItems',
          expand: 'Area($select=AreaPath),Revisions($select=State)',
        }),
      AzureDevOpsValidationError,
    );

    // Valid expand passes
    const valid = validateAnalyticsQuery({
      entitySet: 'WorkItems',
      select: ['WorkItemId', 'Title'],
      expand: 'AssignedTo($select=UserName)',
    });
    assert.equal(valid.expand, 'AssignedTo($select=UserName)');
  });

  void it('Guard #4: blocks unsupported OData operators/functions outside string literals', () => {
    for (const badApply of [
      'aggregate(WorkItemId with countdistinct as DistinctCount)',
      'topcount(5, StoryPoints)',
      'bottompercent(10, StoryPoints)',
      'filter(isdefined(StoryPoints))',
    ]) {
      assert.throws(
        () =>
          validateAnalyticsQuery({
            entitySet: 'WorkItems',
            apply: badApply,
          }),
        AzureDevOpsValidationError,
        `Expected "${badApply}" to be blocked`,
      );
    }

    for (const badClause of ['$search=foo', '$crossjoin(a,b)', '$rollup(a)']) {
      assert.throws(
        () =>
          validateAnalyticsQuery({
            entitySet: 'WorkItems',
            filter: badClause,
          }),
        AzureDevOpsValidationError,
      );
    }

    // Quoted string literal mentioning countdistinct does NOT false-positive
    const valid = validateAnalyticsQuery({
      entitySet: 'WorkItems',
      select: ['WorkItemId', 'Title'],
      filter: "Title eq 'countdistinct test'",
    });
    assert.equal(valid.filter, "Title eq 'countdistinct test'");
  });

  void it('Guard #5: blocks high-cardinality unique-key groupby (VS403522) and prototype keys', () => {
    for (const col of [
      'WorkItemId',
      'WorkItemSK',
      'Title',
      'PipelineRunId',
      'TestResultId',
      'Parent/WorkItemId',
    ]) {
      assert.throws(
        () =>
          validateAnalyticsQuery({
            entitySet: 'WorkItems',
            apply: `groupby((${col}), aggregate($count as Count))`,
          }),
        (err: unknown) =>
          err instanceof AzureDevOpsValidationError &&
          /VS403522/i.test(err.message),
      );
    }

    assert.throws(
      () =>
        validateAnalyticsQuery({
          entitySet: 'WorkItems',
          apply: 'groupby((__proto__/State), aggregate($count as Count))',
        }),
      AzureDevOpsValidationError,
    );
  });

  void it('Guard #6: requires timezone offset on DateTimeOffset literals (VS403494)', () => {
    assert.equal(
      findDateTimeWithoutTimezone('ChangedDate ge 2026-11-01T00:00:00'),
      '2026-11-01T00:00:00',
    );
    assert.equal(
      findDateTimeWithoutTimezone('ChangedDate ge 2026-11-01'),
      '2026-11-01',
    );
    assert.equal(
      findDateTimeWithoutTimezone('ChangedDate ge 2026-11-01T00:00:00Z'),
      undefined,
    );
    assert.equal(
      findDateTimeWithoutTimezone('ChangedDate ge 2026-11-01T00:00:00+05:30'),
      undefined,
    );
    assert.equal(
      findDateTimeWithoutTimezone("Title eq 'Release 2026-11-01'"),
      undefined,
    );
    // GUIDs must never false-positive
    assert.equal(
      findDateTimeWithoutTimezone(
        'AreaSK eq 10000000-0000-4000-8000-000000000002',
      ),
      undefined,
    );

    assert.throws(
      () =>
        validateAnalyticsQuery({
          entitySet: 'WorkItems',
          select: ['WorkItemId'],
          filter: 'ChangedDate ge 2026-11-01T00:00:00',
        }),
      (err: unknown) =>
        err instanceof AzureDevOpsValidationError &&
        /VS403494/i.test(err.message) &&
        /timezone/i.test(err.message),
    );
  });

  void it('Guard #7 & #8: enforces <=800 columns, injects default $select, and caps $top <= 1000', () => {
    // Default $select injected when neither select nor apply is passed
    const withDefault = validateAnalyticsQuery({ entitySet: 'WorkItems' });
    assert.ok(withDefault.selectColumns.length > 0);
    assert.ok(withDefault.selectColumns.length <= 20);
    assert.ok(withDefault.appliedDefaultSelect);
    assert.equal(withDefault.top, 100);

    // >800 columns rejected client-side
    const tooMany = Array.from({ length: 805 }, (_, i) => `Custom_Col${i}`);
    assert.throws(
      () =>
        validateAnalyticsQuery({
          entitySet: 'WorkItems',
          select: tooMany,
        }),
      (err: unknown) =>
        err instanceof AzureDevOpsValidationError &&
        /800/.test(err.message) &&
        /VS403670/.test(err.message),
    );

    // top > 1000 rejected client-side
    assert.throws(
      () =>
        validateAnalyticsQuery({
          entitySet: 'WorkItems',
          select: ['WorkItemId'],
          top: 50000,
        }),
      (err: unknown) =>
        err instanceof AzureDevOpsValidationError && /1000/.test(err.message),
    );
  });

  void it('Guard #9 & #10: builds percent-encoded URLs (%2B), single-op $batch payloads, and validates same-origin nextLink', () => {
    const projectBase = buildODataBaseUrl({
      analyticsBaseUrl: 'https://analytics.dev.azure.com/myorg',
      scope: 'project',
      projectId: 'DemoProject',
      version: 'v3.0-preview',
    });
    assert.equal(
      projectBase,
      'https://analytics.dev.azure.com/myorg/DemoProject/_odata/v3.0-preview',
    );

    const orgBase = buildODataBaseUrl({
      analyticsBaseUrl: 'https://analytics.dev.azure.com/myorg/',
      scope: 'organization',
      version: 'v3.0-preview',
    });
    assert.equal(
      orgBase,
      'https://analytics.dev.azure.com/myorg/_odata/v3.0-preview',
    );

    const validated = validateAnalyticsQuery({
      entitySet: 'WorkItems',
      select: ['WorkItemId', 'ChangedDate'],
      filter: 'ChangedDate ge 2026-11-22T00:00:00+08:00',
    });
    const url = buildRequestUrl(
      `${projectBase}/WorkItems`,
      buildODataQueryParams(validated),
    );
    assert.match(url, /%2B08%3A00/i);

    // Single-op $batch build & parse round-trip
    const batch = buildSingleOpBatchPayload('WorkItems?$select=WorkItemId');
    assert.match(batch.contentType, /^multipart\/mixed; boundary=batch_/);
    assert.equal((batch.body.match(/^GET\s+/gm) ?? []).length, 1);

    const respBody =
      `--batchresp_1\r\n` +
      `Content-Type: application/http\r\n` +
      `Content-Transfer-Encoding: binary\r\n\r\n` +
      `HTTP/1.1 200 OK\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `{"value":[{"WorkItemId":101}]}\r\n` +
      `--batchresp_1--\r\n`;
    const parsed = parseSingleOpBatchResponse(
      respBody,
      'multipart/mixed; boundary=batchresp_1',
    );
    assert.equal(parsed.status, 200);
    assert.deepEqual(parsed.data, { value: [{ WorkItemId: 101 }] });

    // Same-origin nextLink validation
    const okNext = validateSameOriginNextLink(
      'https://analytics.dev.azure.com/myorg/DemoProject/_odata/v3.0-preview/WorkItems?$skiptoken=abc',
      'https://analytics.dev.azure.com/myorg',
    );
    assert.ok(okNext.includes('$skiptoken=abc'));

    for (const evil of [
      'https://evil.example/myorg/_odata/v3.0-preview/WorkItems',
      'http://analytics.dev.azure.com/myorg/_odata/v3.0-preview/WorkItems',
      'https://analytics.dev.azure.com/myorg/_apis/wit/workItems',
      'not-a-url',
    ]) {
      assert.throws(
        () =>
          validateSameOriginNextLink(
            evil,
            'https://analytics.dev.azure.com/myorg',
          ),
        AzureDevOpsValidationError,
      );
    }
  });

  void it('maps Analytics HTTP errors (404, 403, 401, 400, 429, TF400733) to actionable errors', () => {
    const err404 = mapAnalyticsHttpError(
      new HttpError({
        message: 'Not Found',
        status: 404,
        statusText: 'Not Found',
        url: 'https://ado.corp/tfs/DefaultCollection/_odata/v3.0-preview/WorkItems',
        responseData: { error: { code: 'VS403483', message: 'Not enabled' } },
      }),
      'querying WorkItems',
      'v3.0-preview',
    );
    assert.ok(err404 instanceof AzureDevOpsResourceNotFoundError);
    assert.match(err404.message, /Analytics.*extension|enabled/i);

    const err403 = mapAnalyticsHttpError(
      new HttpError({
        message: 'Forbidden',
        status: 403,
        statusText: 'Forbidden',
        url: 'https://analytics.dev.azure.com/org/_odata/v3.0-preview/WorkItems',
        responseData: {
          error: { code: 'VS403483', message: 'View analytics required' },
        },
      }),
      'querying WorkItems',
      'v3.0-preview',
    );
    assert.ok(err403 instanceof AzureDevOpsPermissionError);
    assert.match(err403.message, /View analytics/i);
    assert.match(err403.message, /vso\.analytics/i);

    const err401 = mapAnalyticsHttpError(
      new HttpError({
        message: 'Unauthorized',
        status: 401,
        statusText: 'Unauthorized',
        url: 'https://analytics.dev.azure.com/org/_odata/v3.0-preview/WorkItems',
      }),
      'querying WorkItems',
      'v3.0-preview',
    );
    assert.ok(err401 instanceof AzureDevOpsAuthenticationError);

    const err429 = mapAnalyticsHttpError(
      new HttpError({
        message: 'Too Many Requests',
        status: 429,
        statusText: 'Too Many Requests',
        url: 'https://analytics.dev.azure.com/org/_odata/v3.0-preview/WorkItems',
        headers: { 'retry-after': '15' },
      }),
      'querying WorkItems',
      'v3.0-preview',
    );
    assert.ok(err429 instanceof AzureDevOpsRateLimitError);

    const errTimeout = mapAnalyticsHttpError(
      new HttpError({
        message: 'TF400733: The request has been canceled: Timeout.',
        status: 500,
        statusText: 'Internal Server Error',
        url: 'https://analytics.dev.azure.com/org/_odata/v3.0-preview/WorkItems',
        responseData: {
          error: { code: 'TF400733', message: 'Query exceeded timeout' },
        },
      }),
      'querying WorkItems',
      'v3.0-preview',
    );
    assert.ok(errTimeout instanceof AzureDevOpsError);
    assert.match(errTimeout.message, /TF400733/);
    assert.match(errTimeout.message, /\$apply|apply/i);

    const err400Wide = mapAnalyticsHttpError(
      new HttpError({
        message: 'Bad Request',
        status: 400,
        statusText: 'Bad Request',
        url: 'https://analytics.dev.azure.com/org/_odata/v3.0-preview/WorkItems',
        responseData: {
          error: { code: 'VS403670', message: 'Too many columns' },
        },
      }),
      'querying WorkItems',
      'v3.0-preview',
    );
    assert.ok(err400Wide instanceof AzureDevOpsValidationError);
    assert.match(err400Wide.message, /800/);
  });
});
