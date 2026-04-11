import { Controller, Post, Get, Body, UseGuards, Req, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateCheckoutDto, UpgradePlanDto, PortalDto } from './dto/billing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingService.createCheckoutSession(
      dto,
      dto.organizationId,
      req.user.userId,
    );
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  async upgradePlan(
    @Body() dto: UpgradePlanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingService.createUpgradeSession(
      dto.plan,
      dto.organizationId,
      req.user.userId,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  @Post('downgrade')
  @UseGuards(JwtAuthGuard)
  async downgradePlan(
    @Body() dto: PortalDto & { organizationId: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingService.createDowngradeSession(
      dto.organizationId,
      req.user.userId,
      dto.returnUrl,
    );
  }

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  async getPortal(
    @Query('organizationId') organizationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingService.createCustomerPortal(
      organizationId,
      req.user.userId,
    );
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  async getSubscription(
    @Query('organizationId') organizationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingService.getSubscription(organizationId, req.user.userId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Query('organizationId') organizationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billingService.getBillingHistory(organizationId, req.user.userId);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(
    @Body() body: { organizationId: string },
    @Req() req: AuthenticatedRequest,
  ) {
    await this.billingService.cancelSubscription(body.organizationId, req.user.userId);
    return { success: true, message: 'Subscription cancelled successfully' };
  }

  @Get('plans')
  async getPlans() {
    return this.billingService.getPlans();
  }
}
