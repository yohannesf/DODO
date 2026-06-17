// Minimal ambient types for `node-cron` (no upstream/@types package). Only the
// surface used to tick the scheduled-export runner (spec §16.12).
declare module 'node-cron' {
  interface ScheduledTask {
    start: () => void;
    stop: () => void;
  }
  export function schedule(
    expression: string,
    task: () => void,
    options?: { scheduled?: boolean; timezone?: string },
  ): ScheduledTask;
  export function validate(expression: string): boolean;
  const nodeCron: { schedule: typeof schedule; validate: typeof validate };
  export default nodeCron;
}
