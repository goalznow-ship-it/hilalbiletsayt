import { AuthenticatedUser, isCentralAdmin } from "../auth/authorization";
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class BranchService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async findAll(user: AuthenticatedUser, includeInactive = false) {
    return this.prisma.branch.findMany({
      where: {
        ...(includeInactive && isCentralAdmin(user) ? {} : { isActive: true }),
        ...(!isCentralAdmin(user)
          ? { id: { in: (user.branches ?? []).map((branch) => branch.id) } }
          : {}),
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    if (
      !isCentralAdmin(user) &&
      !user.branches?.some((branch) => branch.id === id)
    )
      throw new ForbiddenException("Bu filiala icazəniz yoxdur");
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException("Filial tapılmadı");
    return branch;
  }

  async create(data: {
    name: string;
    code: string;
    address?: string;
    phone?: string;
    isActive?: boolean;
  }, actorId?: string) {
    return this.prisma.$transaction(async tx => {
    const branch = await tx.branch.create({
      data,
    });
    await this.audit.log("BRANCH_CREATED", actorId, "Branch", branch.id, { code: branch.code }, tx);
    return branch;
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      code: string;
      address?: string;
      phone?: string;
      isActive?: boolean;
    }>,
    actorId?: string,
  ) {
    return this.prisma.$transaction(async tx => {
    const branch = await tx.branch.update({
      where: { id },
      data,
    });
    await this.audit.log("BRANCH_UPDATED", actorId, "Branch", id, { fields: Object.keys(data), isActive: branch.isActive }, tx);
    return branch;
    });
  }
}
