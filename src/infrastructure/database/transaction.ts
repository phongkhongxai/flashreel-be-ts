import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { AuthError } from '../../modules/auth/auth-error.js';

export async function serializable<T>(
  db: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2034', 'P2002'].includes(error.code) ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new Error('Transaction retries exhausted');
}

export async function activeActor(
  tx: Prisma.TransactionClient,
  id: string,
  username: string,
) {
  const user = await tx.user.findUnique({ where: { id } });
  if (!user) throw new AuthError(1005, 'User not existed', 404);
  if (
    !user.enabled ||
    user.accountStatus === 'CANCELLED' ||
    user.username !== username
  )
    throw new AuthError(2011, 'Account has been cancelled', 403);
  return user;
}
