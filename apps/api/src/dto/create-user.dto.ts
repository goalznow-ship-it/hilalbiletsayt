import { z } from "zod";

export const CreateUserDto = z.object({
  email: z.string().trim().email("Düzgün e-poçt daxil edin").toLowerCase(),
  fullName: z.string().trim().min(2, "Ad ən azı 2 simvol olmalıdır").max(200),
  password: z.string().min(12, "Password must be at least 12 characters").max(128),
  role: z
    .enum([
      "SUPER_ADMIN",
      "CENTRAL_ADMIN",
      "BRANCH_MANAGER",
      "SELLER",
      "OMR_OPERATOR",
    ])
    .optional(),
  branchIds: z.array(z.string().uuid()).min(1),
  isActive: z.boolean().default(true),
});

export type CreateUserDto = z.infer<typeof CreateUserDto>;

export const UpdateUserDto = z.object({
  email: z.string().trim().email("Düzgün e-poçt daxil edin").toLowerCase().optional(),
  fullName: z.string().trim().min(2, "Ad ən azı 2 simvol olmalıdır").max(200).optional(),
  role: z
    .enum([
      "SUPER_ADMIN",
      "CENTRAL_ADMIN",
      "BRANCH_MANAGER",
      "SELLER",
      "OMR_OPERATOR",
    ])
    .optional(),
  branchIds: z.array(z.string().uuid()).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserDto>;

export const PasswordResetDto = z.object({
  newPassword: z.string().min(12, "Password must be at least 12 characters").max(128),
});

export type PasswordResetDto = z.infer<typeof PasswordResetDto>;

export const AssignRolesDto = z.object({
  roleIds: z.array(z.string().min(1)).min(1).max(5),
  branchId: z.string().uuid().optional(),
}).strict();

export const UserFiltersDto = z.object({
  page: z.coerce.number().int().min(1).max(1000000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  branchId: z.string().uuid().optional(),
  branch: z.string().uuid().optional(),
  roleId: z.string().min(1).max(50).optional(),
  role: z.string().min(1).max(50).optional(),
  search: z.string().trim().max(200).optional(),
}).strict();
