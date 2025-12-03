import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload/:folder')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Param('folder') folder: string,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не был загружен');
    }

    const key = await this.storageService.uploadFile(file, folder);
    const url = this.storageService.getFileUrl(key) || '';

    return {
      key,
      url,
    };
  }

  @Post('upload-multiple/:folder')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('folder') folder: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Файлы не были загружены');
    }

    const keys = await this.storageService.uploadFiles(files, folder);
    const urls = keys
      .map((key) => this.storageService.getFileUrl(key))
      .filter((url): url is string => url !== null);

    return {
      keys,
      urls,
    };
  }
}

