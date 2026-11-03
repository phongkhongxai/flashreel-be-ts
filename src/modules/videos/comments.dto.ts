import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
export class CommentDto {
  @ApiProperty({ example: 'Great video!', maxLength: 500 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  content!: string;
}
