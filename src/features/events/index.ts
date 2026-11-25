import { z } from 'zod';
import {
  CANONICAL_EVENT_NAMES,
  EventEngine,
  MAX_POLL_EVENTS,
} from '../../shared/events/index.ts';
import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { RegisteredTool } from '../../shared/registry/tool-registry.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';

export interface ToolContextWithEvents extends ToolContext {
  readonly eventEngine?: EventEngine;
}

export interface EventsFeatureModule {
  readonly toolset: 'events';
  readonly tools: readonly RegisteredTool[];
}

export type EventEngineProvider =
  | EventEngine
  | ((ctx: ToolContext) => EventEngine | undefined);

export const ListEventTypesSchema = z.object({});

export const PollEventsSchema = z.object({
  name: z
    .enum(CANONICAL_EVENT_NAMES)
    .describe('Canonical SEP-3415 Azure DevOps event type to poll'),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Optional event filter arguments (e.g. projectId, repositoryId, pullRequestId, pipelineId, runId, workItemId, branch, status, state)',
    ),
  cursor: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Opaque cursor from a previous poll_events call, or null / omitted to bootstrap at the current stream head',
    ),
  maxEvents: z
    .number()
    .int()
    .min(1)
    .max(MAX_POLL_EVENTS)
    .optional()
    .describe(
      `Maximum number of events to return (default 50, max ${MAX_POLL_EVENTS})`,
    ),
});

let fallbackEngine: EventEngine | null = null;

function getFallbackEngine(): EventEngine {
  if (!fallbackEngine) {
    fallbackEngine = new EventEngine();
  }
  return fallbackEngine;
}

function resolveEngine(
  ctx: ToolContext,
  provider?: EventEngineProvider,
): EventEngine {
  if (typeof provider === 'function') {
    const provided = provider(ctx);
    if (provided) {
      return provided;
    }
  } else if (provider) {
    return provider;
  }

  if (ctx.eventEngine) {
    return ctx.eventEngine;
  }

  return getFallbackEngine();
}

/**
 * Create the opt-in read-only `events` toolset (`list_event_types` and `poll_events`)
 * bound to a server `EventEngine` (or lazily resolved from `ctx.eventEngine`).
 */
export function createEventsTools(
  provider?: EventEngineProvider,
): readonly RegisteredTool[] {
  return [
    defineTool({
      name: 'list_event_types',
      description:
        'List all canonical Azure DevOps SEP-3415 event types with their supported delivery modes, filter schemas, and minimal payload schemas.',
      schema: ListEventTypesSchema,
      readOnly: true,
      openWorld: false,
      handler: async (ctx) => {
        const engine = resolveEngine(ctx, provider);
        return engine.listEvents();
      },
    }),
    defineTool({
      name: 'poll_events',
      description:
        'Poll buffered Azure DevOps events using SEP-3415 cursor semantics. Pass cursor: null (or omit cursor) to bootstrap at the current head, then supply the returned cursor on subsequent calls.',
      schema: PollEventsSchema,
      readOnly: true,
      openWorld: false,
      handler: async (ctx, args) => {
        const engine = resolveEngine(ctx, provider);
        return engine.pollEvents({
          name: args.name,
          arguments: args.arguments,
          cursor: args.cursor ?? null,
          maxEvents: args.maxEvents,
        });
      },
    }),
  ];
}

/**
 * Create an `EventsFeatureModule` bound to a specific `EventEngine` or getter.
 */
export function createEventsFeature(
  provider?: EventEngineProvider,
): EventsFeatureModule {
  return {
    toolset: 'events',
    tools: createEventsTools(provider),
  };
}

export const eventsTools: readonly RegisteredTool[] = createEventsTools();

export const eventsFeature: EventsFeatureModule = {
  toolset: 'events',
  tools: eventsTools,
};
