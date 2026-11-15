import { z } from "zod";
import { PasswordResetDto } from "../dto/create-user.dto";

export const changePasswordSchema = PasswordResetDto.extend({
  currentPassword: z.string().min(1).max(128),
}).strict().refine(data => data.currentPassword !== data.newPassword, "Yeni şifrə hazırkı şifrədən fərqli olmalıdır.");
