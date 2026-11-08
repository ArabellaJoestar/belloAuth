import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type TokenContextType = 'ISSUED_BY_US' | 'ACQUIRED_EXTERNAL';

@Entity('session_audits')
export class SessionAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  jti!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  @Column({ name: 'client_id', type: 'varchar', length: 120 })
  clientId!: string;

  @Column({ name: 'token_context', type: 'varchar', length: 30 })
  tokenContext!: TokenContextType;

  @Column({ name: 'grant_type', type: 'varchar', length: 40 })
  grantType!: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 60, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  @Column({ name: 'webhook_target_url', type: 'varchar', length: 500, nullable: true })
  webhookTargetUrl!: string | null;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  @Index()
  @Column({ name: 'webhook_notified', type: 'boolean', default: false })
  webhookNotified!: boolean;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}