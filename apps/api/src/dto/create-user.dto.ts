import { z } from "zod";

export const CreateUserDto = z.object({
  email: z.string().email("Valid email required"),
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z
    .enum([
      "SUPER_ADMIN",
      "CENTRAL_ADMIN",
      "BRANCH_MANAGER",
      "SELLER",
      "OMR_OPERATOR",
    ])
    .optional(),
  branchIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export type CreateUserDto = z.infer<typeof CreateUserDto>;

export const UpdateUserDto = z.object({
  email: z.string().email("Valid email required").optional(),
  fullName: z.string().min(2, "Name must be at least 2 characters").optional(),
  role: z
    .enum([
      "SUPER_ADMIN",
      "CENTRAL_ADMIN",
      "BRANCH_MANAGER",
      "SELLER",
      "OMR_OPERATOR",
    ])
    .optional(),
  branchIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserDto>;

export const PasswordResetDto = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export type PasswordResetDto = z.infer<typeof PasswordResetDto>;
