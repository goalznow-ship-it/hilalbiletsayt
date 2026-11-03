import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: "Application and database health check" })
  @ApiResponse({ status: 200, description: "Health status" })
  check() {
    return this.healthService.check();
  }
}
