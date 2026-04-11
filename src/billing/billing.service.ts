import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organization/entities/organization.entity';
import { Membership } from '../organization/entities/membership.entity';
import { Subscription } from './entities/subscription.entity';
import { CreateCheckoutDto } from './dto/billing.dto';

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const Stripe = require('stripe');

@Injectable()
export class BillingService {
  private stripe: any;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Organization)
    private orgRepository: Repository<Organization>,
    @InjectRepository(Membership)
    private membershipRepository: Repository<Membership>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
  ) {
    this.stripe = new Stripe(
      configService.get<string>('STRIPE_SECRET_KEY') || '',
      {
        apiVersion: '2024-12-18.acacia',
      },
    );
  }

  private async isAdmin(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.membershipRepository.findOne({
      where: { userId, organizationId },
    });
    return membership ? ['admin'].includes(membership.role) : false;
  }

  async getOrCreateCustomer(organizationId: string): Promise<string> {
    let subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (!subscription) {
      subscription = this.subscriptionRepository.create({
        organizationId,
        stripeCustomerId: '',
        stripeSubscriptionId: '',
        plan: 'free',
        status: 'active',
        currentPeriodEnd: new Date(),
      });
      await this.subscriptionRepository.save(subscription);
    }

    const customerId = subscription.stripeCustomerId;
    if (!customerId || customerId.trim() === '') {
      const customer = await this.stripe.customers.create({
        metadata: { organizationId },
      });
      subscription.stripeCustomerId = customer.id;
      await this.subscriptionRepository.save(subscription);
      return customer.id;
    }

    return customerId;
  }

  async createCheckoutSession(
    dto: CreateCheckoutDto,
    organizationId: string,
    userId: string,
  ): Promise<{ url: string }> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can manage billing');
    }

    const org = await this.orgRepository.findOne({
      where: { id: organizationId },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const customerId = await this.getOrCreateCustomer(organizationId);

    if (!customerId || customerId.trim() === '') {
      throw new Error('Failed to create Stripe customer');
    }

    const planMap: Record<string, string> = {
      'starter': this.configService.get('STRIPE_PRICE_STARTER') || '',
      'pro': this.configService.get('STRIPE_PRICE_PRO') || '',
      'enterprise': this.configService.get('STRIPE_PRICE_ENTERPRISE') || '',
    };
    
    const priceId = planMap[dto.plan.toLowerCase()] || planMap['starter'];

    if (!priceId || !priceId.startsWith('price_')) {
      throw new Error('Stripe price not configured. Please set STRIPE_PRICE_STARTER in .env');
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url:
        dto.successUrl ||
        `${this.configService.get('APP_URL')}/billing/success`,
      cancel_url:
        dto.cancelUrl || `${this.configService.get('APP_URL')}/billing/cancel`,
      metadata: { organizationId },
    });

    return { url: session.url };
  }

  async getSubscription(organizationId: string, userId: string): Promise<Subscription | null> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can view billing');
    }

    return this.subscriptionRepository.findOne({
      where: { organizationId },
    });
  }

  async getBillingHistory(organizationId: string, userId: string): Promise<any[]> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can view billing');
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });
    if (!subscription || !subscription.stripeCustomerId) {
      return [];
    }

    const invoices = await this.stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 20,
    });

    return invoices.data.map((invoice: any) => ({
      id: invoice.id,
      amount: invoice.amount_paid,
      status: invoice.status,
      date: invoice.created,
      url: invoice.hosted_invoice_url,
    }));
  }

  async cancelSubscription(organizationId: string, userId: string): Promise<void> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can cancel subscription');
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });
    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new NotFoundException('No active subscription');
    }

    await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    subscription.stripeSubscriptionId = '';
    subscription.plan = 'free';
    subscription.status = 'cancelled';
    await this.subscriptionRepository.save(subscription);
  }

  async getPlans(): Promise<any[]> {
    return [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        priceId: null,
        features: [
          '1 Organization',
          'Up to 3 Members',
          '1 API Key',
          'Basic Dashboard',
          'Community Support',
          'Limited API usage (1,000/month)',
        ],
        limits: {
          organizations: 1,
          members: 3,
          apiKeys: 1,
          apiUsage: 1000,
        },
        description: 'Best for trying out the platform',
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 50,
        priceId: this.configService.get('STRIPE_PRICE_PRO') || '',
        features: [
          'Up to 5 Organizations',
          'Up to 10 Members per org',
          'Up to 10 API Keys per org',
          'Full Dashboard + Analytics',
          'Billing & Subscription Management',
          'Invite & Role Management',
          'Higher API usage (50,000/month)',
          'Email Support',
        ],
        limits: {
          organizations: 5,
          members: 10,
          apiKeys: 10,
          apiUsage: 50000,
        },
        description: 'Best for startups and small teams',
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 100,
        priceId: this.configService.get('STRIPE_PRICE_ENTERPRISE') || '',
        features: [
          'Unlimited Organizations',
          'Unlimited Members',
          'Unlimited API Keys',
          'Advanced Usage Tracking',
          'Priority Support',
          'Custom Limits',
          'Dedicated Onboarding',
        ],
        limits: {
          organizations: 'unlimited',
          members: 'unlimited',
          apiKeys: 'unlimited',
          apiUsage: 'custom',
        },
        description: 'For serious clients (high-ticket)',
      },
    ];
  }

  async createUpgradeSession(
    plan: string,
    organizationId: string,
    userId: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{ url: string }> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can upgrade');
    }

    const org = await this.orgRepository.findOne({
      where: { id: organizationId },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const planMap: Record<string, string> = {
      'starter': this.configService.get('STRIPE_PRICE_STARTER') || '',
      'pro': this.configService.get('STRIPE_PRICE_PRO') || '',
      'enterprise': this.configService.get('STRIPE_PRICE_ENTERPRISE') || '',
    };
    
    const priceId = planMap[plan.toLowerCase()] || planMap['pro'];

    if (!priceId || !priceId.startsWith('price_')) {
      throw new Error('Stripe price not configured');
    }

    const customerId = await this.getOrCreateCustomer(organizationId);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl || `${this.configService.get('APP_URL')}/billing/success`,
      cancel_url: cancelUrl || `${this.configService.get('APP_URL')}/billing/cancel`,
      metadata: { organizationId, action: 'upgrade' },
    });

    return { url: session.url };
  }

  async createDowngradeSession(
    organizationId: string,
    userId: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<{ url: string }> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can downgrade');
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });
    if (!subscription || !subscription.stripeCustomerId) {
      throw new NotFoundException('No active subscription to downgrade');
    }

    const customerPortal = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: successUrl || `${this.configService.get('APP_URL')}/billing`,
    });

    return { url: customerPortal.url };
  }

  async createCustomerPortal(
    organizationId: string,
    userId: string,
    returnUrl?: string,
  ): Promise<{ url: string }> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can access billing portal');
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });
    if (!subscription || !subscription.stripeCustomerId) {
      throw new NotFoundException('No billing account found. Please upgrade first.');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl || `${this.configService.get('APP_URL')}/billing`,
    });

    return { url: session.url };
  }

  async handleSubscriptionCreated(organizationId: string, stripeSubscriptionId: string, plan: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });
    if (subscription) {
      subscription.stripeSubscriptionId = stripeSubscriptionId;
      subscription.plan = plan;
      subscription.status = 'active';
      await this.subscriptionRepository.save(subscription);
    }
  }

  async handleSubscriptionUpdated(organizationId: string, stripeSubscriptionId: string, status: string, currentPeriodEnd: Date): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, stripeSubscriptionId },
    });
    if (subscription) {
      subscription.status = status;
      subscription.currentPeriodEnd = currentPeriodEnd;
      await this.subscriptionRepository.save(subscription);
    }
  }

  async handleSubscriptionDeleted(organizationId: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });
    if (subscription) {
      subscription.stripeSubscriptionId = '';
      subscription.plan = 'free';
      subscription.status = 'cancelled';
      await this.subscriptionRepository.save(subscription);
    }
  }
}
