import { SetMetadata, Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";

export const AUTHORIZED_BRANCH = "authorizedBranch";

export const AuthorizedBranch = (branchId: string) => SetMetadata(AUTHORIZED_BRANCH, branchId);

@Injectable()
export class BranchGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const requiredBranch = this.reflector.getAllAndOverride<string>(AUTHORIZED_BRANCH, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredBranch) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("User not found in token");
    }

    // user.branches comes from JWT strategy validation
    const userBranches = user.branches || [];

    // SUPER_ADMIN has access to all branches
    const isSuperAdmin = user.roles && user.roles.includes('SUPER_ADMIN');
    // Or check from userBranchRoles
    const hasSuperAdminRole = user.userBranchRoles?.some((ubr: any) => ubr.role.name === 'SUPER_ADMIN');

    if (isSuperAdmin || hasSuperAdminRole) {
      return true;
    }

    // Check if user has access to the required branch
    const hasBranchAccess = userBranches.some((b: any) => b.id === requiredBranch);

    if (!hasBranchAccess) {
      throw new ForbiddenException(`Access denied to branch ${requiredBranch}. User has access to: ${userBranches.map((b: any) => b.id).join(', ')}`);
    }

    return true;
  }
}