import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OAuthGrantType = 'authorization_code' | 'client_credentials' | 'refresh_token';

@Entity('oauth_clients')
export class OAuthClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'varchar', length: 120, unique: true })
  clientId!: string;

  @Column({ name: 'client_secret_hash', type: 'varchar', length: 255 })
  clientSecretHash!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'redirect_uris', type: 'simple-json' })
  redirectUris!: string[];

  @Column({ name: 'allowed_grants', type: 'simple-json' })
  allowedGrants!: OAuthGrantType[];

  @Column({ name: 'webhook_url', type: 'varchar', length: 500, nullable: true })
  webhookUrl!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}