import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { LecturerEntity } from '../master-data/entities/lecturer.entity';
import { StudentEntity } from '../master-data/entities/student.entity';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserRoleEntity,
      RoleEntity,
      LecturerEntity,
      StudentEntity,
    ]),
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
