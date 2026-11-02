import { Module } from '@nestjs/common';
import { OmrController } from '../omr/omr.controller';

@Module({
  controllers: [OmrController],
  providers: [],
  exports: [],
})
export class OmrApiModule {}