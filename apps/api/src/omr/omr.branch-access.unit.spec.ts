import { describe, expect, it, vi } from "vitest";
import { OmrService } from "./omr.service";
import type { AuthenticatedUser } from "../auth/authorization";

function operator(userId: string, branchId: string): AuthenticatedUser {
  return { userId, roles: ["OMR_OPERATOR"], branches: [{ id: branchId }],
    userBranchRoles: [{ branchId, role: "OMR_OPERATOR" }] };
}
function setup(branches: Array<string | null>, owner = "owner") {
  const pages = branches.map((branch, i) => ({
    id: `page-${i}`, pageIndex: i,
    sheetId: branch ? `sheet-${i}` : null,
    sheet: branch ? { branchId: branch } : null,
    data: { score: 20 },
  }));
  const findUnique = vi.fn().mockResolvedValue({ id: "upload", createdBy: owner, pages });
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { omrUpload: { findUnique, findMany },
    exam: { findUnique: vi.fn().mockResolvedValue({ id: "exam" }) } };
  return { service: new OmrService(prisma as never, {} as never), findUnique, findMany };
}

describe("OMR branch access (regression)", () => {
  it("allows the original branch owner", async () => {
    const { service } = setup(["A"]);
    const upload = await service.getUpload("upload", operator("owner", "A"));
    expect(upload.id).toBe("upload");
    expect(upload.pages[0]).not.toHaveProperty("sheet");
  });
  it("denies another user in the same branch", async () => {
    const { service } = setup(["A"]);
    await expect(service.getUpload("upload", operator("other", "A"))).rejects.toThrow();
  });
  it("denies the former owner after branch transfer", async () => {
    const { service } = setup(["A"]);
    await expect(service.getUpload("upload", operator("owner", "B"))).rejects.toThrow();
  });
  it("denies uploads spanning unauthorized branches", async () => {
    const { service } = setup(["A", "B"]);
    await expect(service.getUpload("upload", operator("owner", "A"))).rejects.toThrow();
  });
  it("fails closed for unbound QR scans", async () => {
    const { service } = setup([null]);
    await expect(service.getUpload("upload", operator("owner", "A"))).rejects.toThrow();
  });
  it("still allows central admin to inspect unbound scans", async () => {
    const { service } = setup([null]);
    await expect(service.getUpload("upload", { userId: "admin", roles: ["SUPER_ADMIN"] }))
      .resolves.toHaveProperty("id", "upload");
  });
  it("scopes listUploads by ownership and every page branch", async () => {
    const { service, findMany } = setup(["A"]);
    await service.listUploads("exam", operator("owner", "A"));
    const where = findMany.mock.calls[0][0].where;
    expect(where.createdBy).toBe("owner");
    expect(where.pages.some.sheet.is.branchId.in).toEqual(["A"]);
    expect(where.pages.every.sheet.is.branchId.in).toEqual(["A"]);
  });
  it("keeps all-branch visibility for central admins", async () => {
    const { service, findMany } = setup(["A"]);
    await service.listUploads("exam", { userId: "admin", roles: ["SUPER_ADMIN"] });
    expect(findMany.mock.calls[0][0].where).toEqual({ examId: "exam" });
  });
});
