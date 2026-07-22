import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MicService } from './mic.service';
import { MicController } from './mic.controller';
import { MicDocument } from './entities/mic-document.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MicDocument])],
  providers: [MicService],
  controllers: [MicController],
  exports: [MicService],
})
export class MicModule {}
