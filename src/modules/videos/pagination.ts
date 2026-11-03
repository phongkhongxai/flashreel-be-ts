import { AuthError } from '../auth/auth-error.js';
export function pagination(page: string | undefined, size: string | undefined) {
  const parse = (value: string | undefined, fallback: number) =>
    value === undefined ? fallback : /^\d+$/.test(value) ? Number(value) : NaN;
  const p = parse(page, 0),
    s = parse(size, 20);
  if (!Number.isSafeInteger(p) || !Number.isSafeInteger(s) || p < 0 || s < 1)
    throw new AuthError(1001, 'Uncategorized error', 400);
  return { page: p, size: s };
}
