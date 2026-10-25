import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { BranchService } from "./branch.service";

@ApiTags("branches")
@Controller("branches")
export class BranchController {
  constructor(private branchService: BranchService) {}

  @Get()
  @ApiOperation({ summary: "Get all branches" })
  @ApiResponse({ status: 200, description: "List of branches" })
  async findAll() {
    return this.branchService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get branch by ID" })
  @ApiResponse({ status: 200, description: "Branch details" })
  async findOne(@Param("id") id: string) {
    return this.branchService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a new branch" })
  @ApiResponse({ status: 201, description: "Branch created" })
  async create(@Body() data: any) {
    return this.branchService.create(data);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a branch" })
  @ApiResponse({ status: 200, description: "Branch updated" })
  async update(@Param("id") id: string, @Body() data: any) {
    return this.branchService.update(id, data);
  }
}
