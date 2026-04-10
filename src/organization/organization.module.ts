import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { Organization } from './entities/organization.entity';
import { Invitation } from './entities/invitation.entity';
import { Membership } from './entities/membership.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { ApiKey } from './entities/api-key.entity';
import { Activity } from './entities/activity.entity';
import { Project } from './entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, Invitation, Membership, User, Subscription, ApiKey, Activity, Project])],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
