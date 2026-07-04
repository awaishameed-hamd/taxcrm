import { Module } from '@nestjs/common'
import { PipelineStepsController } from './pipeline-steps.controller'
import { PipelineStepsService } from './pipeline-steps.service'

@Module({
  controllers: [PipelineStepsController],
  providers:   [PipelineStepsService],
  exports:     [PipelineStepsService],
})
export class PipelineStepsModule {}
