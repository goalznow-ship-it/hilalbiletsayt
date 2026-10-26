import { AuthenticatedUser, isCentralAdmin } from "../auth/authorization";
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BranchService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser) {
    return this.prisma.branch.findMany({
      where: {
        isActive: true,
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
  }) {
    return this.prisma.branch.create({
      data,
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
  ) {
    return this.prisma.branch.update({
      where: { id },
      data,
    });
  }
}
