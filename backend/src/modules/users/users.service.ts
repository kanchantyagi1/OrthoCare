import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  /// Login accepts either an email or a phone number, since clinic staff are
  /// commonly identified by phone rather than email.
  findByEmailOrPhone(identifier: string) {
    return this.repo.findOne({
      where: [{ email: identifier }, { phone: identifier }],
    });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  findByRole(role: Role) {
    return this.repo.find({ where: { role, isActive: true } });
  }

  create(data: Partial<User>) {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }

  async updatePassword(userId: string, passwordHash: string) {
    await this.repo.update({ id: userId }, { passwordHash });
  }

  async updateFcmToken(userId: string, token: string) {
    await this.repo.update({ id: userId }, { fcmToken: token });
  }

  get repository() {
    return this.repo;
  }
}
