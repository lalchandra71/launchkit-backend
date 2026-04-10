import { IsEmail, IsNotEmpty, IsString, IsUUID, IsOptional, IsIn } from 'class-validator';

const VALID_ROLES = ['admin', 'viewer', 'member'];

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  name?: string;
}

export class InviteUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsIn(VALID_ROLES)
  role: string;

  @IsUUID()
  @IsNotEmpty()
  organizationId: string;
}

export class SwitchOrganizationDto {
  @IsUUID()
  @IsNotEmpty()
  organizationId: string;
}

export class UpdateMemberRoleDto {
  @IsString()
  @IsIn(VALID_ROLES)
  role: string;
}
