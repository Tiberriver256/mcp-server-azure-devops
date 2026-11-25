import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { TimeFrame } from 'azure-devops-node-api/interfaces/WorkInterfaces.js';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';
import { listTeamIterations, normalizeTimeFrame } from './feature.ts';

const SPRINT_1_UUID = '10000000-0000-4000-8000-000000000001';
const SPRINT_2_UUID = '10000000-0000-4000-8000-000000000002';
const SPRINT_3_UUID = '10000000-0000-4000-8000-000000000003';

const SAMPLE_NUMERIC_ITERATIONS = [
  {
    id: SPRINT_1_UUID,
    name: 'Sprint 1',
    path: 'DemoProject\\Sprint 1',
    attributes: {
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      finishDate: new Date('2026-10-14T00:00:00.000Z'),
      timeFrame: TimeFrame.Past,
    },
  },
  {
    id: SPRINT_2_UUID,
    name: 'Sprint 2',
    path: 'DemoProject\\Sprint 2',
    attributes: {
      startDate: new Date('2026-11-15T00:00:00.000Z'),
      finishDate: new Date('2026-11-30T00:00:00.000Z'),
      timeFrame: TimeFrame.Current,
    },
  },
  {
    id: SPRINT_3_UUID,
    name: 'Sprint 3',
    path: 'DemoProject\\Sprint 3',
    attributes: {
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      finishDate: new Date('2026-12-14T00:00:00.000Z'),
      timeFrame: TimeFrame.Future,
    },
  },
];

void describe('listTeamIterations unit', () => {
  void test('normalizeTimeFrame handles numeric enum and string values', () => {
    assert.strictEqual(normalizeTimeFrame(TimeFrame.Past), 'past');
    assert.strictEqual(normalizeTimeFrame(TimeFrame.Current), 'current');
    assert.strictEqual(normalizeTimeFrame(TimeFrame.Future), 'future');
    assert.strictEqual(normalizeTimeFrame(0), 'past');
    assert.strictEqual(normalizeTimeFrame(1), 'current');
    assert.strictEqual(normalizeTimeFrame(2), 'future');
    assert.strictEqual(normalizeTimeFrame('past'), 'past');
    assert.strictEqual(normalizeTimeFrame('Current'), 'current');
    assert.strictEqual(normalizeTimeFrame('FUTURE'), 'future');
    assert.strictEqual(normalizeTimeFrame(undefined), undefined);
    assert.strictEqual(normalizeTimeFrame('unknown'), undefined);
  });

  void test('lists all team iterations when timeframe is omitted', async () => {
    const mockGetTeamIterations = mock.fn((..._args: unknown[]) =>
      Promise.resolve(SAMPLE_NUMERIC_ITERATIONS),
    );
    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamIterations: mockGetTeamIterations,
        }),
      ),
    } as unknown as WebApi;

    const result = await listTeamIterations(mockConnection, {
      projectId: 'DemoProject',
      teamId: 'DemoProject Team',
    });

    assert.strictEqual(mockGetTeamIterations.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetTeamIterations.mock.calls[0]?.arguments, [
      { project: 'DemoProject', team: 'DemoProject Team' },
      undefined,
    ]);
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(
      result.map((i) => i.attributes?.timeFrame),
      ['past', 'current', 'future'],
    );
    assert.strictEqual(
      result[0]?.attributes?.startDate,
      '2026-10-01T00:00:00.000Z',
    );
  });

  void test('sends $timeframe="current" on the wire when timeframe is "current"', async () => {
    const mockGetTeamIterations = mock.fn((..._args: unknown[]) =>
      Promise.resolve([SAMPLE_NUMERIC_ITERATIONS[1]]),
    );
    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamIterations: mockGetTeamIterations,
        }),
      ),
    } as unknown as WebApi;

    const result = await listTeamIterations(mockConnection, {
      projectId: 'DemoProject',
      timeframe: 'current',
    });

    assert.deepStrictEqual(mockGetTeamIterations.mock.calls[0]?.arguments, [
      { project: 'DemoProject', team: undefined },
      'current',
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.id, SPRINT_2_UUID);
    assert.strictEqual(result[0]?.name, 'Sprint 2');
  });

  void test('omits $timeframe on the wire and filters client-side for timeframe="past" (numeric enum)', async () => {
    const mockGetTeamIterations = mock.fn((..._args: unknown[]) =>
      Promise.resolve(SAMPLE_NUMERIC_ITERATIONS),
    );
    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamIterations: mockGetTeamIterations,
        }),
      ),
    } as unknown as WebApi;

    const result = await listTeamIterations(mockConnection, {
      projectId: 'DemoProject',
      teamId: 'DemoProject Team',
      timeframe: 'past',
    });

    assert.deepStrictEqual(mockGetTeamIterations.mock.calls[0]?.arguments, [
      { project: 'DemoProject', team: 'DemoProject Team' },
      undefined,
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.id, SPRINT_1_UUID);
    assert.strictEqual(result[0]?.name, 'Sprint 1');
  });

  void test('omits $timeframe on the wire and filters client-side for timeframe="future" (string timeFrame)', async () => {
    const stringIterations = [
      {
        id: SPRINT_1_UUID,
        name: 'Sprint 1',
        attributes: { timeFrame: 'past' },
      },
      {
        id: SPRINT_2_UUID,
        name: 'Sprint 2',
        attributes: { timeFrame: 'Current' },
      },
      {
        id: SPRINT_3_UUID,
        name: 'Sprint 3',
        attributes: { timeFrame: 'future' },
      },
    ];
    const mockGetTeamIterations = mock.fn((..._args: unknown[]) =>
      Promise.resolve(stringIterations),
    );
    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamIterations: mockGetTeamIterations,
        }),
      ),
    } as unknown as WebApi;

    const result = await listTeamIterations(mockConnection, {
      projectId: 'DemoProject',
      timeframe: 'future',
    });

    assert.deepStrictEqual(mockGetTeamIterations.mock.calls[0]?.arguments, [
      { project: 'DemoProject', team: undefined },
      undefined,
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.id, SPRINT_3_UUID);
    assert.strictEqual(result[0]?.name, 'Sprint 3');
  });

  void test('throws AzureDevOpsResourceNotFoundError when API returns undefined (404) and maps API errors cleanly', async () => {
    const mockEmptyConn = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamIterations: mock.fn(() => Promise.resolve(undefined)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        listTeamIterations(mockEmptyConn, {
          projectId: 'DemoProject',
        }),
      AzureDevOpsResourceNotFoundError,
    );

    const notFoundErr = Object.assign(new Error('Team not found'), {
      statusCode: 404,
    });
    const mock404Conn = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamIterations: mock.fn(() => Promise.reject(notFoundErr)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        listTeamIterations(mock404Conn, {
          projectId: 'DemoProject',
          teamId: 'MissingTeam',
        }),
      AzureDevOpsResourceNotFoundError,
    );

    const mockUnexpectedConn = {
      getWorkApi: mock.fn(() => Promise.reject(new Error('Connection reset'))),
    } as unknown as WebApi;
    await assert.rejects(
      () =>
        listTeamIterations(mockUnexpectedConn, { projectId: 'DemoProject' }),
      AzureDevOpsError,
    );
  });
});
