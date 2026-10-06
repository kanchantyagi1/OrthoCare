import { IsOptional, IsString } from 'class-validator';

export class UploadDocumentDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  surgeryType?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
