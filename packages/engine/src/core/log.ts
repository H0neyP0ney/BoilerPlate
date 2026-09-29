/**
 * Logs actifs uniquement en dev : en build de prod, tout est no-op
 * (Poki demande de retirer le code de debug des builds).
 */
const noop = (..._args: unknown[]) => {};

export const log = import.meta.env.DEV
  ? {
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    }
  : { info: noop, warn: noop, error: noop };
