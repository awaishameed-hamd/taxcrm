import { Global, Module } from '@nestjs/common'
import { StorageService } from './storage.service'

// Global so every module that stores a file can sign links without re-importing.
@Global()
@Module({
  providers: [StorageService],
  exports:   [StorageService],
})
export class StorageModule {}
