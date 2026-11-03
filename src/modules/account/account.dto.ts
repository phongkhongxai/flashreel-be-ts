import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';
export class ConfirmDto {
  @ApiProperty({ example: true }) @Equals(true) confirmed!: boolean;
}
