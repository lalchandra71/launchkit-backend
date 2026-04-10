import { Controller, Post, Get, Put, Delete, Body, UseGuards, Req, Param, Query } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto, InviteUserDto } from './dto/organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string; organizationId: string };
}

@Controller('org')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateOrganizationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizationService.create(dto, req.user.userId);
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  async getCurrent(@Req() req: AuthenticatedRequest) {
    return this.organizationService.getCurrent(req.user.userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') orgId: string,
    @Body() dto: { name?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizationService.update(orgId, req.user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(
    @Param('id') orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizationService.delete(orgId, req.user.userId);
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard)
  async invite(@Body() dto: InviteUserDto, @Req() req: AuthenticatedRequest) {
    return this.organizationService.invite(dto, dto.organizationId, req.user.userId);
  }

  @Post('invite/accept')
  @UseGuards(JwtAuthGuard)
  async acceptInvite(
    @Body() body: { token: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizationService.acceptInvitation(body.token, req.user.userId);
  }

  @Get('invite/pending')
  @UseGuards(JwtAuthGuard)
  async getPendingInvites(@Req() req: AuthenticatedRequest) {
    return this.organizationService.getPendingInvitations(req.user.userId);
  }

  @Get('list')
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: AuthenticatedRequest) {
    return this.organizationService.list(req.user.userId);
  }

  @Get('invite/:orgId')
  @UseGuards(JwtAuthGuard)
  async getInvitations(@Param('orgId') orgId: string) {
    return this.organizationService.getInvitations(orgId);
  }

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  async getMembers(@Param('id') orgId: string) {
    return this.organizationService.getMembers(orgId);
  }

  @Get(':id/dashboard')
  @UseGuards(JwtAuthGuard)
  async getDashboard(@Param('id') orgId: string, @Req() req: AuthenticatedRequest) {
    return this.organizationService.getDashboard(orgId, req.user.userId);
  }

  @Get(':id/settings')
  @UseGuards(JwtAuthGuard)
  async getSettings(@Param('id') orgId: string, @Req() req: AuthenticatedRequest) {
    return this.organizationService.getSettings(orgId, req.user.userId);
  }

  @Post(':id/api-keys')
  @UseGuards(JwtAuthGuard)
  async createApiKey(
    @Param('id') orgId: string,
    @Body() body: { name: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizationService.createApiKey(orgId, req.user.userId, body.name);
  }

  @Delete(':id/api-keys/:keyId')
  @UseGuards(JwtAuthGuard)
  async revokeApiKey(
    @Param('id') orgId: string,
    @Param('keyId') keyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizationService.revokeApiKey(orgId, req.user.userId, keyId);
  }
}
