/**
 * Token-lean result + validation helpers for the design MCP server.
 *
 * Two rules drive everything here:
 *  1. A payload is written into `content[0].text` exactly once. `structuredContent`
 *     is only added while the copy is cheap, so large reads never reach the model twice.
 *  2. Failures carry a `hint` and a `nextCall`, because an unexplained MCP error
 *     costs a retry round-trip and every retry re-sends the arguments.
 */

/** At or below this many characters a result may be duplicated into structuredContent. */
export const INLINE_COPY_LIMIT = 1400;

export class DesignError extends Error {
  constructor(message, hint = '', nextCall = '') {
    super(message);
    this.name = 'DesignError';
    this.hint = hint;
    this.nextCall = nextCall;
  }
}

export function fail(message, hint = '', nextCall = '') {
  return new DesignError(message, hint, nextCall);
}

export function errorResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof DesignError ? error.hint : '';
  const nextCall = error instanceof DesignError ? error.nextCall : '';
  const payload = { error: message, ...(hint ? { hint } : {}), ...(nextCall ? { nextCall } : {}) };
  const text = [message, hint && `hint: ${hint}`, nextCall && `next: ${nextCall}`].filter(Boolean).join('\n');
  return { isError: true, content: [{ type: 'text', text }], structuredContent: payload };
}

/**
 * Single-copy tool result. `pretty` is reserved for `detail: 'full'` where the
 * caller explicitly asked for a readable document.
 */
export function leanResult(value, { pretty = false } = {}) {
  const compact = JSON.stringify(value) ?? 'null';
  const result = { content: [{ type: 'text', text: pretty ? JSON.stringify(value, null, 2) : compact }] };
  if (compact.length <= INLINE_COPY_LIMIT) result.structuredContent = value;
  return result;
}

/** Rounds every number in a value so summaries stay small and diffs stay stable. */
export function roundDeep(value, dp = 4) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return value;
    const scaled = Math.round(value * 10 ** dp) / 10 ** dp;
    return Object.is(scaled, -0) ? 0 : scaled;
  }
  if (Array.isArray(value)) return value.map((item) => roundDeep(item, dp));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = roundDeep(item, dp);
    return out;
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Argument coercion — every failure names the field and the next step.
 * ------------------------------------------------------------------ */

export function asObject(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new DesignError('Tool arguments must be a JSON object', 'Pass a JSON object of arguments.');
  }
  return args;
}

export function asString(value, field, { def, maxLength = 240 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (def !== undefined) return def;
    throw new DesignError(`Missing required string: ${field}`, `${field} is required.`, '');
  }
  if (typeof value !== 'string') throw new DesignError(`${field} must be a string`, 'Use a JSON string value.');
  const trimmed = value.trim();
  if (!trimmed) throw new DesignError(`${field} must not be empty`);
  if (trimmed.length > maxLength) throw new DesignError(`${field} is longer than ${maxLength} characters`);
  return trimmed;
}

export function asEnum(value, allowed, field, { def } = {}) {
  if (value === undefined || value === null || value === '') {
    if (def !== undefined) return def;
    throw new DesignError(`Missing required value: ${field}`, `Allowed: ${allowed.join(', ')}`, '');
  }
  if (!allowed.includes(value)) {
    throw new DesignError(`${field} must be one of: ${allowed.join(', ')}`, `Received ${JSON.stringify(value)}.`);
  }
  return value;
}

export function asNumber(value, field, { def, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') {
    if (def !== undefined) return def;
    throw new DesignError(`Missing required number: ${field}`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DesignError(`${field} must be a finite number`, `Received ${JSON.stringify(value)}.`);
  }
  if (value < min || value > max) {
    throw new DesignError(`${field} must be between ${min} and ${max}`, `Received ${value}.`);
  }
  return value;
}

export function asBool(value, field, { def = false } = {}) {
  if (value === undefined || value === null) return def;
  if (typeof value !== 'boolean') throw new DesignError(`${field} must be true or false`);
  return value;
}

export function asArray(value, field, { def = [], maxLength = Infinity, minLength = 0 } = {}) {
  if (value === undefined || value === null) return def;
  if (!Array.isArray(value)) throw new DesignError(`${field} must be an array`, `Received ${typeof value}.`);
  if (value.length < minLength) throw new DesignError(`${field} needs at least ${minLength} item(s)`);
  if (value.length > maxLength) {
    throw new DesignError(
      `${field} has ${value.length} items; the limit is ${maxLength}`,
      'Send fewer items per call and repeat the call — the file persists between calls.',
    );
  }
  return value;
}

/** Rejects non-hex colors early so a bad palette never reaches a saved file. */
export function asColor(value, field, { def } = {}) {
  if (value === undefined || value === null || value === '') {
    if (def !== undefined) return def;
    throw new DesignError(`Missing color: ${field}`);
  }
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new DesignError(`${field} must be a six-digit hex color such as #63c7b2`, `Received ${JSON.stringify(value)}.`);
  }
  return value.toLowerCase();
}

/**
 * Enforces the per-call budgets that keep one tool call from becoming a
 * 300K-token message. Checked before any work happens.
 */
export const BUDGET = { keyframes: 500, shapes: 200, ops: 50, rows: 200, select: 40 };

export function within(value, field, limit) {
  if (value.length > limit) {
    throw new DesignError(
      `${field} exceeds the per-call limit of ${limit} (got ${value.length})`,
      'Send a smaller batch; changes are written to the project file immediately so repeat calls continue where this one stopped.',
    );
  }
  return value;
}
