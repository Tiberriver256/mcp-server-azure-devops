import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CANONICAL_EVENT_NAMES,
  CURSOR_PATTERN,
  EventEngine,
} from '../../shared/events/index.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import { createEventsFeature, eventsFeature } from './index.ts';
import type { ToolContextWithEvents } from './index.ts';

function makeDummyCtx(eventEngine?: EventEngine): ToolContextWithEvents {
  return {
    config: {
      organizationUrl: 'https://dev.azure.com/demo',
      authMethod: 'pat',
      defaultProject: 'DemoProject',
      apiVersion: '7.1',
      readOnly: false,
      spotlighting: true,
    },
    baseUrls: {
      type: 'services',
      organization: 'demo',
      coreBaseUrl: 'https://dev.azure.com/demo',
      searchBaseUrl: 'https://almsearch.dev.azure.com/demo',
      identityBaseUrl: 'https://vssps.dev.azure.com/demo',
      analyticsBaseUrl: 'https://analytics.dev.azure.com/demo',
    },
    http: {} as ToolContext['http'],
    getWebApi: async () => {
      throw new Error('unused');
    },
    getAuthHeader: async () => 'Basic dGVzdA==',
    requestAzureDevOps: async () => {
      throw new Error('unused');
    },
    resolveBaseUrls: () => {
      throw new Error('unused');
    },
    resolveProjectId: () => 'DemoProject',
    resolveOptionalProjectId: () => 'DemoProject',
    eventEngine,
  };
}

void describe('Opt-in events read-only toolset', () => {
  void it('exposes list_event_types and poll_events with accurate read-only ToolAnnotations', () => {
    assert.equal(eventsFeature.toolset, 'events');
    assert.deepEqual(eventsFeature.tools.map((t) => t.name).sort(), [
      'list_event_types',
      'poll_events',
    ]);

    for (const tool of eventsFeature.tools) {
      assert.equal(tool.readOnly, true);
      const def = tool.toDefinition();
      assert.equal(def.annotations.readOnlyHint, true);
      assert.equal(def.annotations.destructiveHint, false);
      assert.equal(def.annotations.idempotentHint, true);
      assert.equal(def.annotations.openWorldHint, false);
    }
  });

  void it('list_event_types returns all 5 canonical event descriptors and poll_events polls bound EventEngine', async () => {
    const engine = new EventEngine();
    const feature = createEventsFeature(engine);
    const listTool = feature.tools.find((t) => t.name === 'list_event_types')!;
    const pollTool = feature.tools.find((t) => t.name === 'poll_events')!;
    const ctx = makeDummyCtx();

    const listRes = await listTool.execute(ctx, {});
    const listJson = JSON.parse(listRes.content[0].text) as {
      resultType: string;
      events: Array<{ name: string }>;
    };
    assert.equal(listJson.resultType, 'complete');
    assert.deepEqual(
      listJson.events.map((e) => e.name).sort(),
      [...CANONICAL_EVENT_NAMES].sort(),
    );

    const bootRes = await pollTool.execute(ctx, {
      name: 'ado.pipeline.run_state_changed',
      cursor: null,
    });
    const boot = JSON.parse(bootRes.content[0].text) as {
      cursor: string;
      events: unknown[];
    };
    assert.match(boot.cursor, CURSOR_PATTERN);
    assert.deepEqual(boot.events, []);

    engine.ingestWebhook({
      id: 'evt-build-500',
      eventType: 'build.complete',
      createdDate: '2026-11-25T10:02:00Z',
      resource: {
        id: 500,
        buildNumber: '20261125.1',
        status: 'completed',
        result: 'succeeded',
        definition: { id: 10, name: 'CI-Main' },
        project: { id: 'proj-1', name: 'DemoProject' },
      },
    });

    const pollRes = await pollTool.execute(ctx, {
      name: 'ado.pipeline.run_state_changed',
      cursor: boot.cursor,
    });
    const polled = JSON.parse(pollRes.content[0].text) as {
      events: Array<{ name: string; data: { runId: number } }>;
    };
    assert.equal(polled.events.length, 1);
    assert.equal(polled.events[0].name, 'ado.pipeline.run_state_changed');
    assert.equal(polled.events[0].data.runId, 500);

    engine.close();
  });

  void it('default eventsFeature resolves EventEngine dynamically from ctx.eventEngine', async () => {
    const engine = new EventEngine();
    const ctx = makeDummyCtx(engine);
    const pollTool = eventsFeature.tools.find((t) => t.name === 'poll_events')!;

    const boot = JSON.parse(
      (await pollTool.execute(ctx, { name: 'ado.git.pushed' })).content[0].text,
    ) as { cursor: string };

    engine.publish({
      eventId: 'git-1',
      name: 'ado.git.pushed',
      timestamp: '2026-11-25T12:00:00Z',
      data: { project: 'DemoProject', repository: 'DemoRepo', commitCount: 2 },
    });

    const polled = JSON.parse(
      (
        await pollTool.execute(ctx, {
          name: 'ado.git.pushed',
          cursor: boot.cursor,
        })
      ).content[0].text,
    ) as { events: Array<{ eventId: string }> };
    assert.equal(polled.events.length, 1);
    assert.equal(polled.events[0].eventId, 'git-1');

    engine.close();
  });
});
