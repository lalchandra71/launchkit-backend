import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationModule } from './organization/organization.module';
import { BillingModule } from './billing/billing.module';
import { WebhookModule } from './webhooks/webhook.module';
import { User } from './users/entities/user.entity';
import { Organization } from './organization/entities/organization.entity';
import { Invitation } from './organization/entities/invitation.entity';
import { Membership } from './organization/entities/membership.entity';
import { Subscription } from './billing/entities/subscription.entity';
import { ApiKey } from './organization/entities/api-key.entity';
import { Activity } from './organization/entities/activity.entity';
import { Project } from './organization/entities/project.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        entities: [User, Organization, Invitation, Membership, Subscription, ApiKey, Activity, Project],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    OrganizationModule,
    BillingModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
