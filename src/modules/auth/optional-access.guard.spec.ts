import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { AccessGuard } from './access.guard.js';
import { OptionalAccessGuard } from './optional-access.guard.js';

describe('OptionalAccessGuard', () => {
  const verify = jest.fn<() => Promise<boolean>>();
  const guard = new OptionalAccessGuard({
    canActivate: verify,
  } as unknown as AccessGuard);
  const context = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authorization === undefined ? {} : { authorization },
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows requests without an authorization header', () => {
    expect(guard.canActivate(context())).toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('validates any supplied authorization header', async () => {
    verify.mockResolvedValue(true);
    await expect(guard.canActivate(context('Bearer token'))).resolves.toBe(
      true,
    );
    expect(verify).toHaveBeenCalled();
  });
});
