import { Injectable, OnModuleInit, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { CryptoUtil } from '../../common/utils/crypto.util.js';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultUsers();
  }

  private async seedDefaultUsers() {
    const defaultUsers = [
      {
        email: 'dev@oauth.local',
        password: 'Password@123',
        twoFactorEnabled: false,
      },
      {
        email: 'sec@oauth.local',
        password: 'Password@123',
        twoFactorEnabled: true,
      },
    ];

    for (const item of defaultUsers) {
      const exists = await this.usersRepo.findOne({ where: { email: item.email } });
      if (!exists) {
        const user = this.usersRepo.create({
          email: item.email,
          passwordHash: CryptoUtil.hashSecret(item.password),
          twoFactorEnabled: item.twoFactorEnabled,
        });
        await this.usersRepo.save(user);
        this.logger.log(`Usuario seed criado: ${item.email} (2FA: ${item.twoFactorEnabled})`);
      }
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async createUser(email: string, plainPassword: string, twoFactorEnabled = false): Promise<User> {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('E-mail ja cadastrado.');
    }

    const user = this.usersRepo.create({
      email: normalizedEmail,
      passwordHash: CryptoUtil.hashSecret(plainPassword),
      twoFactorEnabled,
    });

    return this.usersRepo.save(user);
  }

  async toggleTwoFactor(userId: string, enabled: boolean): Promise<User | null> {
    await this.usersRepo.update({ id: userId }, { twoFactorEnabled: enabled });
    return this.findById(userId);
  }
}