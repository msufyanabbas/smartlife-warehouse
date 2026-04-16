import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InventoryModule } from './inventory/inventory.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { TransferRequestsModule } from './transfer-requests/transfer-requests.module';
import { ItemUsageModule } from './item-usage/item-usage.module';
import { ReturnRequestsModule } from './return-requests/return-requests.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ItemRequestsModule } from './item-requests/item-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    AuthModule,
    UsersModule,
    InventoryModule,
    AssignmentsModule,
    TransferRequestsModule,
    ItemUsageModule,
    ReturnRequestsModule,
    ItemRequestsModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}