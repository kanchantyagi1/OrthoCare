import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Standalone TypeORM DataSource used only by the `typeorm` CLI (migration:run / revert / generate).
 * The running NestJS app configures its own connection in app.module.ts via TypeOrmModule.forRootAsync.
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ||
    'postgres://orthocare:orthocare_dev_password@localhost:5432/orthocare',
  entities: [__dirname + '/../modules/**/entities/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: false,
});

export default AppDataSource;
