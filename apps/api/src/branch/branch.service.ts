import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BranchService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
    });
  }

  async findOne(id: string) {
    return this.prisma.branch.findUnique({
      where: { id },
    });
  }

  async create(data: { name: string; code: string; address?: string; phone?: string; isActive?: boolean }) {
    return this.prisma.branch.create({
      data,
    });
  }

  async update(id: string, data: Partial<{ name: string; code: string; address?: string; phone?: string; isActive?: boolean }>) {
    return this.prisma.branch.update({
      where: { id },
      data,
    });
  }
}
