import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "../auth.service";
import type { Request } from "express";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../decorators/public.decorator";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { LoginDto } from "../login.dto";
import { CurrentUser } from "../decorators/current-user.decorator";
import { AuthenticatedUser } from "../authorization";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("password")
  @ApiOperation({ summary: "Change own password and revoke all sessions" })
  changePassword(@Body() input: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.changePassword(user.userId, input);
  }

  // Brute-force protection per client address; raise only for test stacks.
  @Throttle({ default: { limit: Number(process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE ?? 10) || 10, ttl: 60000 } })
  @Public()
  @Post("login")
  @ApiOperation({ summary: "User login" })
  @ApiResponse({ status: 201, description: "Login successful" })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    const token = await this.authService.login(user);
    return token;
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @ApiOperation({ summary: "Get current user info" })
  @ApiResponse({ status: 200, description: "User info" })
  async getMe(@Req() req: Request) {
    return req.user;
  }
}
