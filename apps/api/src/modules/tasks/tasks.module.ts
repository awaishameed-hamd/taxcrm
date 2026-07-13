import { Module } from '@nestjs/common'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { ChatModule } from '../chat/chat.module'

@Module({
  imports: [PrismaModule, NotificationsModule, ChatModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
