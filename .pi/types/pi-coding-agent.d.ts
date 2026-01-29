declare module '@mariozechner/pi-coding-agent' {
  /** Minimal ambient typings for pi extensions when editing inside this repo.
   *  At runtime, pi provides the real module.
   */

  export type ExtensionAPI = any;

  export const DEFAULT_MAX_BYTES: number;
  export const DEFAULT_MAX_LINES: number;

  export function truncateTail(
    input: string,
    options: { maxLines?: number; maxBytes?: number },
  ): {
    content: string;
    truncated: boolean;
    totalLines?: number;
    outputLines?: number;
    totalBytes?: number;
    outputBytes?: number;
  };
}
