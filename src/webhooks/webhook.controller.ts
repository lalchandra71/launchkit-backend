import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../billing/entities/subscription.entity';

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
const Stripe = require('stripe');

@Controller('webhooks')
export class WebhookController {
  private stripe: any;

  constructor(
    private configService: ConfigService,
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

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: any,
  ) {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    let event: any;

    try {
      const rawBody = req.rawBody || JSON.stringify(req.body);
      event = this.stripe.webhooks.constructEvent(
        Buffer.from(rawBody),
        signature,
        webhookSecret,
      );
    } catch {
      throw new Error(`Webhook signature verification failed`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await this.handleCheckoutComplete(session);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await this.handleSubscriptionUpdate(subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await this.handlePaymentFailed(invoice);
        break;
      }
    }

    return { received: true };
  }

  private async handleCheckoutComplete(session: any): Promise<void> {
    const organizationId = session.metadata?.organizationId;
    if (!organizationId || typeof organizationId !== 'string') return;

    const existingSubscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: 'active' },
    });
    if (existingSubscription) {
      existingSubscription.status = 'inactive';
      await this.subscriptionRepository.save(existingSubscription);
    }

    const stripeSubscription = await this.stripe.subscriptions.retrieve(session.subscription);
    const plan = stripeSubscription.items.data[0]?.price?.id;

    let planName = 'pro';
    const pricePro = this.configService.get('STRIPE_PRICE_PRO');
    const priceEnterprise = this.configService.get('STRIPE_PRICE_ENTERPRISE');
    const priceStarter = this.configService.get('STRIPE_PRICE_STARTER');
    
    if (plan === priceEnterprise) {
      planName = 'enterprise';
    } else if (plan === priceStarter) {
      planName = 'starter';
    }

    const newSubscription = this.subscriptionRepository.create({
      organizationId,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      plan: planName,
      status: 'active',
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    });
    await this.subscriptionRepository.save(newSubscription);
  }

  private async handleSubscriptionUpdate(subscription: any): Promise<void> {
    const sub = await this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!sub) return;

    sub.status = subscription.status;
    sub.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
      sub.plan = 'free';
    }
    await this.subscriptionRepository.save(sub);
  }

  private async handlePaymentFailed(invoice: any): Promise<void> {
    const sub = await this.subscriptionRepository.findOne({
      where: { stripeCustomerId: invoice.customer },
    });
    if (!sub) return;

    sub.status = 'past_due';
    await this.subscriptionRepository.save(sub);
  }
}
