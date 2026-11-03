import { envValidationSchema } from './env.validation.js';
const valid = {
  CORS_ORIGINS: '*',
  DATABASE_URL: 'mysql://user:password@localhost:3306/test',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: '9000',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'access',
  MINIO_SECRET_KEY: 'secret',
  MINIO_BUCKET: 'videos',
  MINIO_PUBLIC_URL: 'http://localhost:9000',
  JWT_SECRET: 'a'.repeat(32),
};
describe('environment validation', () => {
  it('converts and defaults configuration values', () => {
    const result = envValidationSchema.validate(valid);
    expect(result.error).toBeUndefined();
    expect(result.value.MINIO_USE_SSL).toBe(false);
    expect(result.value.PORT).toBe(8080);
  });
  it('rejects missing credentials and invalid URLs', () => {
    expect(
      envValidationSchema.validate({ ...valid, JWT_SECRET: '' }).error,
    ).toBeDefined();
    expect(
      envValidationSchema.validate({ ...valid, DATABASE_URL: 'invalid' }).error,
    ).toBeDefined();
    expect(
      envValidationSchema.validate({ ...valid, MINIO_PUBLIC_URL: '' }).error,
    ).toBeDefined();
  });
});
