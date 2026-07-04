import { NestFactory, Reflector } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ValidationPipe } from '@nestjs/common'
import { join } from 'path'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { RolesGuard } from './common/guards/roles.guard'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // Serve uploaded files (chat attachments, etc.) statically
  app.useStaticAssets(join(process.cwd(), process.env.UPLOAD_DIR ?? './uploads'), {
    prefix: '/uploads',
  })

  // CORS
  app.enableCors({
    origin:      process.env.CLIENT_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  // Global prefix
  app.setGlobalPrefix('api')

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:        true,
      forbidNonWhitelisted: true,
      transform:        true,
    }),
  )

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter())

  // Global response transform
  app.useGlobalInterceptors(new TransformInterceptor())

  const port = process.env.PORT ?? 4000
  await app.listen(port)
  console.log(`CA Firm API running on http://localhost:${port}/api`)
}

bootstrap()
