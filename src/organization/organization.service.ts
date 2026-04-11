import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Organization } from './entities/organization.entity';
import { Invitation } from './entities/invitation.entity';
import { Membership } from './entities/membership.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { ApiKey } from './entities/api-key.entity';
import { Activity } from './entities/activity.entity';
import { Project } from './entities/project.entity';
import { CreateOrganizationDto, InviteUserDto } from './dto/organization.dto';

const VALID_ROLES = ['admin', 'viewer', 'member'];

const ADMIN_ROLES = ['admin'];

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private orgRepository: Repository<Organization>,
    @InjectRepository(Invitation)
    private invitationRepository: Repository<Invitation>,
    @InjectRepository(Membership)
    private membershipRepository: Repository<Membership>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  async create(
    dto: CreateOrganizationDto,
    userId: string,
  ): Promise<Organization> {
    const org = this.orgRepository.create({ name: dto.name });
    const savedOrg = await this.orgRepository.save(org);
    
    const membership = this.membershipRepository.create({
      userId,
      organizationId: savedOrg.id,
      role: 'admin',
    });
    await this.membershipRepository.save(membership);

    const subscription = this.subscriptionRepository.create({
      organizationId: savedOrg.id,
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      plan: 'Free',
      status: 'active',
      currentPeriodEnd: new Date(),
    });
    await this.subscriptionRepository.save(subscription);
    
    return savedOrg;
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.orgRepository.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async list(userId: string): Promise<Organization[]> {
    const memberships = await this.membershipRepository.find({
      where: { userId },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    return this.orgRepository.findByIds(orgIds);
  }

  async getMembers(organizationId: string): Promise<any[]> {
    const org = await this.orgRepository.findOne({ where: { id: organizationId } });
    const memberships = await this.membershipRepository.find({ where: { organizationId } });
    const membersWithUser = await Promise.all(
      memberships.map(async (membership) => {
        const user = await this.userRepository.findOne({ where: { id: membership.userId } });
        return {
          ...membership,
          organizationName: org?.name,
          user: user ? { id: user.id, name: user.name, email: user.email } : null,
        };
      }),
    );
    return membersWithUser;
  }

  async getInvitations(organizationId: string): Promise<any[]> {
    const invitations = await this.invitationRepository.find({ 
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
    
    return invitations.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      used: inv.used,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      tempPassword: inv.tempPassword,
      inviteLink: `/signup?token=${inv.token}&email=${encodeURIComponent(inv.email)}`,
    }));
  }

  async invite(
    dto: InviteUserDto,
    organizationId: string,
    requesterUserId: string,
  ): Promise<any> {
    const isAdmin = await this.isAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin or owner can invite users');
    }

    if (!VALID_ROLES.includes(dto.role)) {
      throw new BadRequestException(`Invalid role. Valid roles: ${VALID_ROLES.join(', ')}`);
    }

    const existingInvite = await this.invitationRepository.findOne({
      where: { email: dto.email, organizationId, used: false },
    });
    if (existingInvite) {
      if (existingInvite.expiresAt && new Date() > existingInvite.expiresAt) {
        existingInvite.used = true;
        await this.invitationRepository.save(existingInvite);
      } else {
        throw new BadRequestException('Invitation already sent to this email');
      }
    }
    
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    const tempPassword = uuidv4().replace(/-/g, '').substring(0, 12);

    const invitation = this.invitationRepository.create({
      email: dto.email,
      organizationId,
      role: dto.role,
      token,
      expiresAt,
      tempPassword,
    });

    const savedInvitation = await this.invitationRepository.save(invitation);
    
    await this.logActivity(organizationId, requesterUserId, 'invite', `Invitation sent to ${dto.email}`);
    
    return {
      ...savedInvitation,
      tempPassword,
      inviteLink: `/signup?token=${token}&email=${encodeURIComponent(dto.email)}`,
    };
  }

  async acceptInvitation(token: string, userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const invitation = await this.invitationRepository.findOne({
      where: { token, used: false },
    });

    if (
      !invitation ||
      (invitation.expiresAt && new Date() > invitation.expiresAt)
    ) {
      throw new ForbiddenException('Invalid or expired invitation');
    }

    if (user && invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('Invitation email does not match your account email');
    }

    const membership = this.membershipRepository.create({
      userId,
      organizationId: invitation.organizationId,
      role: invitation.role,
    });
    await this.membershipRepository.save(membership);

    invitation.used = true;
    invitation.status = 'accepted';
    await this.invitationRepository.save(invitation);

    await this.logActivity(invitation.organizationId, userId, 'invite', `Invitation accepted`);
  }

  async findInvitationByToken(token: string): Promise<Invitation | null> {
    return this.invitationRepository.findOne({ where: { token } });
  }

  async getCurrent(userId: string): Promise<Organization | null> {
    const membership = await this.membershipRepository.findOne({
      where: { userId },
      order: { joinedAt: 'ASC' },
    });
    if (!membership) return null;
    return this.findById(membership.organizationId);
  }

  async update(id: string, requesterUserId: string, dto: { name?: string }): Promise<Organization> {
    const isAdmin = await this.isAdmin(requesterUserId, id);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin or owner can update organization');
    }
    const org = await this.findById(id);
    if (dto.name) org.name = dto.name;
    return this.orgRepository.save(org);
  }

  async delete(id: string, userId: string): Promise<void> {
    const membership = await this.membershipRepository.findOne({
      where: { organizationId: id, userId },
    });
    if (!membership || membership.role !== 'admin') {
      throw new ForbiddenException('Only admin can delete organization');
    }
    await this.membershipRepository.delete({ organizationId: id });
    await this.orgRepository.delete(id);
  }

  async removeMember(orgId: string, requesterUserId: string, userIdToRemove: string): Promise<void> {
    const requesterMembership = await this.membershipRepository.findOne({
      where: { organizationId: orgId, userId: requesterUserId },
    });
    if (!requesterMembership || !ADMIN_ROLES.includes(requesterMembership.role)) {
      throw new ForbiddenException('Only admin can remove members');
    }
    
    if (requesterMembership.role === 'admin' && requesterUserId === userIdToRemove) {
      throw new ForbiddenException('Admins cannot remove themselves');
    }
    
    await this.membershipRepository.delete({
      organizationId: orgId,
      userId: userIdToRemove,
    });
  }

  async updateMemberRole(
    orgId: string,
    requesterUserId: string,
    targetUserId: string,
    newRole: string,
  ): Promise<Membership> {
    if (!VALID_ROLES.includes(newRole)) {
      throw new BadRequestException(`Invalid role. Valid roles: ${VALID_ROLES.join(', ')}`);
    }

    const requesterMembership = await this.membershipRepository.findOne({
      where: { organizationId: orgId, userId: requesterUserId },
    });
    if (!requesterMembership || !ADMIN_ROLES.includes(requesterMembership.role)) {
      throw new ForbiddenException('Only admin can update member roles');
    }
    
    const membership = await this.membershipRepository.findOne({
      where: { organizationId: orgId, userId: targetUserId },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
    }
    membership.role = newRole;
    return this.membershipRepository.save(membership);
  }

  async getPendingInvitations(userId: string): Promise<Invitation[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return [];
    return this.invitationRepository.find({
      where: { email: user.email, used: false },
    });
  }

  async isAdmin(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.membershipRepository.findOne({
      where: { userId, organizationId },
    });
    return membership ? ADMIN_ROLES.includes(membership.role) : false;
  }

  async isMember(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.membershipRepository.findOne({
      where: { userId, organizationId },
    });
    return !!membership;
  }

  async canEdit(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.membershipRepository.findOne({
      where: { userId, organizationId },
    });
    return membership ? ['admin', 'member'].includes(membership.role) : false;
  }

  async getDashboard(organizationId: string, userId: string): Promise<any> {
    const [org, members, subscription, allOrgs] = await Promise.all([
      this.findById(organizationId),
      this.getMembers(organizationId),
      this.subscriptionRepository.findOne({ where: { organizationId } }),
      this.list(userId),
    ]);

    const membership = members.find((m: any) => m.userId === userId);
    const userRole = membership?.role?.toLowerCase() || 'member';

    const [apiKeys, projects, recentActivities] = await Promise.all([
      this.apiKeyRepository.find({ where: { organizationId, isActive: true } }),
      this.projectRepository.find({ where: { organizationId } }),
      this.activityRepository.find({
        where: { organizationId },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const apiKeysCount = apiKeys.length;
    const projectsCount = projects.length;

    const planLimit = subscription?.plan === 'Free' ? 5 : 'Unlimited';

    return {
      organization: org,
      members: members,
      memberCount: members.length,
      userRole,
      subscription: subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd?.getTime() / 1000,
      } : null,
      metrics: {
        apiKeysCount,
        projectsCount,
      },
      usageLimits: {
        members: { used: members.length, limit: planLimit },
      },
      recentActivity: recentActivities.map(a => ({
        type: a.type,
        message: a.message,
        time: this.getRelativeTime(a.createdAt),
      })),
    };
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return new Date(date).toLocaleDateString();
  }

  private async logActivity(organizationId: string, userId: string, type: string, message: string): Promise<void> {
    const activity = this.activityRepository.create({
      organizationId,
      userId,
      type: type as any,
      message,
    });
    await this.activityRepository.save(activity);
  }

  async getSettings(organizationId: string, userId: string): Promise<any> {
    const apiKeys = await this.apiKeyRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });

    return {
      apiKeys: apiKeys.map(k => ({
        id: k.id,
        name: k.name,
        key: k.key.substring(0, 12) + 'xxxxxxxxxxxxx',
        created: k.createdAt.toISOString().split('T')[0],
        isActive: k.isActive,
      })),
    };
  }

  async createApiKey(organizationId: string, userId: string, name: string): Promise<ApiKey> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can create API keys');
    }

    const key = 'lk_' + uuidv4().replace(/-/g, '').substring(0, 32);
    const apiKey = this.apiKeyRepository.create({
      name,
      key,
      organizationId,
      isActive: true,
    });

    const savedKey = await this.apiKeyRepository.save(apiKey);
    
    await this.logActivity(organizationId, userId, 'key', `API key "${name}" created`);
    
    return savedKey;
  }

  async revokeApiKey(organizationId: string, userId: string, apiKeyId: string): Promise<void> {
    const isAdmin = await this.isAdmin(userId, organizationId);
    if (!isAdmin) {
      throw new ForbiddenException('Only admin can revoke API keys');
    }

    const apiKey = await this.apiKeyRepository.findOne({ where: { id: apiKeyId, organizationId } });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    apiKey.isActive = false;
    await this.apiKeyRepository.save(apiKey);
  }
}
