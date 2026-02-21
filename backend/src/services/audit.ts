import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export async function createAuditEntry(
  actualSessionLogId: string,
  editedById: string,
  previousData: Record<string, unknown>,
  newData: Record<string, unknown>
): Promise<void> {
  await prisma.sessionAuditLog.create({
    data: {
      actualSessionLogId,
      editedById,
      previousData: previousData as unknown as Prisma.InputJsonValue,
      newData: newData as unknown as Prisma.InputJsonValue,
    },
  });
}
