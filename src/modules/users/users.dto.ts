import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegistrationDto {
  @ApiProperty({ example: 'johndoe', minLength: 4, maxLength: 30 })
  @IsString()
  @Matches(/^[a-zA-Z0-9._]+$/)
  @Length(4, 30)
  username!: string;
  @ApiProperty({ example: 'john@example.com', maxLength: 100 })
  @IsEmail()
  @MaxLength(100)
  email!: string;
  @ApiProperty({ format: 'password', minLength: 8, maxLength: 50 })
  @IsString()
  @Matches(/\S/)
  @Length(8, 50)
  password!: string;
  @ApiProperty({ example: 'John Doe', minLength: 2, maxLength: 50 })
  @IsString()
  @Matches(/\S/)
  @Length(2, 50)
  displayName!: string;
}
export class UpdateUserDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  displayName?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  nickname?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  bio?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}
export class ProfileDto {
  @ApiProperty({ example: 'John', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(100)
  nickname!: string;
  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
