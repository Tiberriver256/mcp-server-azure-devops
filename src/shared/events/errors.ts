/**
 * SEP-3415 / MCP Events JSON-RPC error codes and typed protocol error class.
 */
export const EventsErrorCode = {
  InvalidParams: -32602,
  NotFound: -32023,
  AlreadyExists: -32024,
  ResourceExhausted: -32025,
  Unsupported: -32026,
  Internal: -32027,
} as const;

export type EventsErrorCode =
  (typeof EventsErrorCode)[keyof typeof EventsErrorCode];

export class EventsProtocolError extends Error {
  readonly code: EventsErrorCode;
  readonly data?: Record<string, unknown>;

  constructor(
    code: EventsErrorCode,
    message: string,
    data?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EventsProtocolError';
    this.code = code;
    this.data = data;
  }
}

export function isEventsProtocolError(
  error: unknown,
): error is EventsProtocolError {
  return error instanceof EventsProtocolError;
}
