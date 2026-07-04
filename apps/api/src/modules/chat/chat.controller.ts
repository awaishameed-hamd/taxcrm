import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards,
  UseInterceptors, UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@ca-firm/shared'
import { ChatService } from './chat.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  // ── Who can I start a chat with? ─────────────────────────────────────────
  @Get('contacts')
  getContacts(@CurrentUser() user: { id: string; role: Role }) {
    return this.chatService.getContacts(user.id, user.role)
  }

  @Get('conversations')
  getConversations(@CurrentUser() user: { id: string }) {
    return this.chatService.getConversationsByUser(user.id)
  }

  // ── Start (or resume) a direct 1:1 chat — not tied to a tax return ─────────
  @Post('conversations/direct')
  getOrCreateDirect(
    @Body('userId') userId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.getOrCreateDirectConversation(user.id, userId)
  }

  // ── Start or resume a direct conversation between two users ────────────────
  @Post('conversations')
  getOrCreate(
    @Body('userIdA') userIdA: string,
    @Body('userIdB') userIdB: string,
  ) {
    return this.chatService.getOrCreateDirectConversation(userIdA, userIdB)
  }

  @Get('conversations/:id/messages')
  getMessages(
    @Param('id') conversationId: string,
    @Query('before') before?: string,
    @Query('limit')  limit?:  string,
  ) {
    return this.chatService.getMessages(conversationId, before, limit ? parseInt(limit) : 50)
  }

  // ── Delete a conversation ───────────────────────────────────────────────────
  @Delete('conversations/:id')
  deleteConversation(
    @Param('id') conversationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.chatService.deleteConversation(conversationId, user.id)
  }

  // ── Upload a file/image attachment for chat ─────────────────────────────────
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.chatService.uploadAttachment(file)
  }
}
