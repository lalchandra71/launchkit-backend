import { IsString, IsNotEmpty, IsOptional, IsIn, IsUUID } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  plan: string;

  @IsUUID()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsOptional()
  successUrl?: string;

  @IsString()
  @IsOptional()
  cancelUrl?: string;
}

export class UpgradePlanDto {
  @IsString()
  @IsNotEmpty()
  plan: string;

  @IsUUID()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsOptional()
  successUrl?: string;

  @IsString()
  @IsOptional()
  cancelUrl?: string;
}

export class PortalDto {
  @IsString()
  @IsOptional()
  returnUrl?: string;
}
