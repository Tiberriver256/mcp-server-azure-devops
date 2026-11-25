import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { DayOfWeek } from 'azure-devops-node-api/interfaces/common/System.js';
import { BugsBehavior } from 'azure-devops-node-api/interfaces/WorkInterfaces.js';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors/index.ts';
import { getTeamSettings } from './feature.ts';

const ROOT_ITER_UUID = '10000000-0000-4000-8000-000000000000';
const SPRINT_2_UUID = '10000000-0000-4000-8000-000000000002';

void describe('getTeamSettings unit', () => {
  void test('fetches team settings without team field values when includeAreaPaths is false/omitted', async () => {
    const mockGetTeamSettings = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        backlogIteration: {
          id: ROOT_ITER_UUID,
          name: 'DemoProject',
          path: '',
        },
        defaultIteration: {
          id: SPRINT_2_UUID,
          name: 'Sprint 2',
          path: '\\Sprint 2',
        },
        defaultIterationMacro: '@CurrentIteration',
        backlogVisibilities: {
          'Microsoft.EpicCategory': true,
          'Microsoft.RequirementCategory': true,
        },
        bugsBehavior: BugsBehavior.AsRequirements,
        workingDays: [
          DayOfWeek.Monday,
          DayOfWeek.Tuesday,
          DayOfWeek.Wednesday,
          DayOfWeek.Thursday,
          DayOfWeek.Friday,
        ],
        url: 'https://dev.azure.com/org/DemoProject/_apis/work/teamsettings',
      }),
    );
    const mockGetTeamFieldValues = mock.fn();

    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamSettings: mockGetTeamSettings,
          getTeamFieldValues: mockGetTeamFieldValues,
        }),
      ),
    } as unknown as WebApi;

    const result = await getTeamSettings(mockConnection, {
      projectId: 'DemoProject',
      teamId: 'DemoProject Team',
    });

    assert.strictEqual(mockGetTeamSettings.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetTeamSettings.mock.calls[0]?.arguments, [
      { project: 'DemoProject', team: 'DemoProject Team' },
    ]);
    assert.strictEqual(mockGetTeamFieldValues.mock.callCount(), 0);

    assert.strictEqual(result.defaultIterationMacro, '@CurrentIteration');
    assert.strictEqual(result.bugsBehavior, 'asRequirements');
    assert.deepStrictEqual(result.workingDays, [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
    ]);
    assert.strictEqual(result.backlogIteration?.id, ROOT_ITER_UUID);
    assert.strictEqual(result.defaultIteration?.id, SPRINT_2_UUID);
    assert.strictEqual(result.areaPaths, undefined);
  });

  void test('fetches and includes areaPaths via getTeamFieldValues when includeAreaPaths is true', async () => {
    const mockGetTeamSettings = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        backlogIteration: {
          id: ROOT_ITER_UUID,
          name: 'DemoProject',
          path: '',
        },
        defaultIterationMacro: '@CurrentIteration',
        bugsBehavior: BugsBehavior.AsTasks,
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      }),
    );
    const mockGetTeamFieldValues = mock.fn((..._args: unknown[]) =>
      Promise.resolve({
        field: {
          referenceName: 'System.AreaPath',
          url: 'https://dev.azure.com/org/_apis/wit/fields/System.AreaPath',
        },
        defaultValue: 'DemoProject',
        values: [
          { value: 'DemoProject', includeChildren: true },
          { value: 'DemoProject\\Backend', includeChildren: false },
        ],
        url: 'https://dev.azure.com/org/DemoProject/_apis/work/teamsettings/teamfieldvalues',
      }),
    );

    const mockConnection = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamSettings: mockGetTeamSettings,
          getTeamFieldValues: mockGetTeamFieldValues,
        }),
      ),
    } as unknown as WebApi;

    const result = await getTeamSettings(mockConnection, {
      projectId: 'DemoProject',
      teamId: 'DemoProject Team',
      includeAreaPaths: true,
    });

    assert.strictEqual(mockGetTeamSettings.mock.callCount(), 1);
    assert.strictEqual(mockGetTeamFieldValues.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetTeamFieldValues.mock.calls[0]?.arguments, [
      { project: 'DemoProject', team: 'DemoProject Team' },
    ]);

    assert.strictEqual(result.bugsBehavior, 'asTasks');
    assert.deepStrictEqual(result.workingDays, [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
    ]);
    assert.deepStrictEqual(result.areaPaths, {
      field: {
        referenceName: 'System.AreaPath',
        url: 'https://dev.azure.com/org/_apis/wit/fields/System.AreaPath',
      },
      defaultValue: 'DemoProject',
      values: [
        { value: 'DemoProject', includeChildren: true },
        { value: 'DemoProject\\Backend', includeChildren: false },
      ],
      url: 'https://dev.azure.com/org/DemoProject/_apis/work/teamsettings/teamfieldvalues',
    });
  });

  void test('maps nonexistent team 404 and empty response to AzureDevOpsResourceNotFoundError', async () => {
    const notFoundErr = Object.assign(
      new Error("Team 'MissingTeam' not found."),
      {
        statusCode: 404,
        result: {
          message: "Team 'MissingTeam' not found.",
          typeKey: 'TeamNotFoundException',
        },
      },
    );
    const mock404Conn = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamSettings: mock.fn(() => Promise.reject(notFoundErr)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getTeamSettings(mock404Conn, {
          projectId: 'DemoProject',
          teamId: 'MissingTeam',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.match(err.message, /MissingTeam/);
        return true;
      },
    );

    const mockEmptyConn = {
      getWorkApi: mock.fn(() =>
        Promise.resolve({
          getTeamSettings: mock.fn(() => Promise.resolve(undefined)),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () => getTeamSettings(mockEmptyConn, { projectId: 'DemoProject' }),
      AzureDevOpsResourceNotFoundError,
    );
  });
});
