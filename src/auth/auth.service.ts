import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { OrganizationService } from '../organization/organization.service';
import { SignupDto, LoginDto, SignupWithInviteDto } from './dto/auth.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private organizationService: OrganizationService,
  ) {}

  async signup(
    signupDto: SignupDto,
  ): Promise<{ accessToken: string; user: Partial<User> }> {
    const user = await this.usersService.create(signupDto);
    
    if (signupDto.inviteToken) {
      await this.organizationService.acceptInvitation(signupDto.inviteToken, user.id);
    }
    
    return this.generateTokenResponse(user);
  }

  async signupWithInvite(
    signupDto: SignupWithInviteDto,
  ): Promise<{ accessToken: string; user: Partial<User> }> {
    const randomPassword = uuidv4().replace(/-/g, '').substring(0, 16);
    
    const user = await this.usersService.create({
      email: signupDto.email,
      password: randomPassword,
      name: signupDto.name,
    });
    
    await this.organizationService.acceptInvitation(signupDto.inviteToken, user.id);
    
    return this.generateTokenResponse(user);
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ accessToken: string; user: Partial<User> }> {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokenResponse(user);
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.usersService.findById(userId);
  }

  private generateTokenResponse(user: User): {
    accessToken: string;
    user: Partial<User>;
  } {
    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
    };
  }
}
