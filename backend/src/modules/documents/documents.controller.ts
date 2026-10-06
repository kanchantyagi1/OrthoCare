import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DOCTOR)
@Controller('knowledge/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  findAll() {
    return this.documents.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const document = await this.documents.findOne(id);
    const versions = await this.documents.versionsFor(id);
    return { document, versions };
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: any,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.documents.upload(file, dto, user.id);
  }

  @Post(':versionId/process')
  process(@Param('versionId') versionId: string) {
    return this.documents.process(versionId);
  }

  @Post(':versionId/reprocess')
  reprocess(@Param('versionId') versionId: string) {
    return this.documents.reprocess(versionId);
  }

  @Post(':id/approve-demo')
  approveDemo(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.documents.approveDemoRecord(id, user.id);
  }

  @Post(':id/activate')
  activate(
    @Param('id') id: string,
    @Body('versionId') versionId: string | undefined,
    @CurrentUser() user: { id: string },
  ) {
    return this.documents.activate(id, versionId, user.id);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.documents.archive(id, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.documents.remove(id, user.id);
  }
}
