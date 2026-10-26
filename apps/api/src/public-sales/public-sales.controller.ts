import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PublicSalesService } from "./public-sales.service";
import { PublicPurchaseDto } from "./public-sales.dto";
import { PublicRateGuard } from "./public-rate.guard";

@Controller("public")
@UseGuards(PublicRateGuard)
export class PublicSalesController {
  constructor(private readonly sales: PublicSalesService) {}
  @Get("exams") catalog() {
    return this.sales.catalog();
  }
  @Post("orders") purchase(@Body() data: PublicPurchaseDto) {
    return this.sales.purchase(data);
  }
  @Get("orders/:token") receipt(@Param("token") token: string) {
    return this.sales.receipt(token);
  }
}
