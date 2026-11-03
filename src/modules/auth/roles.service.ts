import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

@Injectable()
export class RolesService {
  constructor(private readonly db: PrismaService) {}

  create(name: string, description?: string) {
    return this.db.role.upsert({
      where: { name },
      create: { name, description },
      update: { description: description ?? null },
    });
  }

  list() {
    return this.db.role.findMany();
  }
}
