import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { OAuthClient } from './entities/oauth-client.entity.js';
import { UsersService } from '../users/users.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { MailService } from '../mail/mail.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { CryptoUtil } from '../../common/utils/crypto.util.js';
import { EnvConfig } from '../../config/env.validation.js';
import {
  LoginInitDto,
  VerifyTwoFactorDto,
  MagicLinkRequestDto,
  MagicLinkVerifyDto,
  TokenExchangeDto,
  ExternalTokenRequestDto,
  UpdateClientWebhookDto,
} from './dto/oauth.schemas.js';

interface PendingAuthSession {
  userId: string;
  email: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
  state?: string;
  ipAddress: string | null;
  userAgent: string | null;
  latitude: number | null;
  longitude: number | null;
  twoFactorCode?: string;
}

interface StoredAuthorizationCode {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
  ipAddress: string | null;
  userAgent: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface StoredRefreshToken {
  userId: string | null;
  clientId: string;
  jti: string;
  ipAddress: string | null;
  userAgent: string | null;
  latitude: number | null;
  longitude: number | null;
}

@Injectable()
export class OAuthService implements OnModuleInit {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) { }

  async onModuleInit() {
    await this.seedDefaultClients();
  }

  private async seedDefaultClients() {
    const port = this.configService.get('PORT');
    const defaultWebhook = `http://localhost:${port}/webhooks/receiver`;

    const defaults = [
      {
        clientId: 'internal-spa-client',
        clientSecret: 'internal-secret-key-2026',
        name: 'Micro-Frontend A (Internal Identity App)',
        redirectUris: [
          'http://localhost:5173/callback',
          'http://localhost:5174/callback',
        ],
        allowedGrants: ['authorization_code', 'refresh_token'] as const,
        webhookUrl: defaultWebhook,
      },
      {
        clientId: 'external-partner-client',
        clientSecret: 'external-secret-key-2026',
        name: 'Micro-Frontend B (External Partner API/App)',
        redirectUris: [
          'http://localhost:5174/callback',
          'http://localhost:5173/callback',
        ],
        allowedGrants: [
          'authorization_code',
          'client_credentials',
          'refresh_token',
        ] as const,
        webhookUrl: defaultWebhook,
      },
    ];

    for (const item of defaults) {
      const exists = await this.clientRepo.findOne({ where: { clientId: item.clientId } });
      if (!exists) {
        const client = this.clientRepo.create({
          clientId: item.clientId,
          clientSecretHash: CryptoUtil.hashSecret(item.clientSecret),
          name: item.name,
          redirectUris: [...item.redirectUris],
          allowedGrants: [...item.allowedGrants],
          webhookUrl: item.webhookUrl,
          isActive: true,
        });
        await this.clientRepo.save(client);
        this.logger.log(`OAuth Client seed criado: ${item.clientId}`);
      }
    }
  }

  private async validateClientAndRedirect(clientId: string, redirectUri: string): Promise<OAuthClient> {
    const client = await this.clientRepo.findOne({ where: { clientId, isActive: true } });
    if (!client) {
      throw new UnauthorizedException('ID de usuário inválido ou inativo.');
    }
    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException('Redirecionamento não autorizado.');
    }
    return client;
  }

  async initiateLogin(
    dto: LoginInitDto,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    await this.validateClientAndRedirect(dto.clientId, dto.redirectUri);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !CryptoUtil.verifySecret(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const baseSession: PendingAuthSession = {
      userId: user.id,
      email: dto.email,
      clientId: dto.clientId,
      redirectUri: dto.redirectUri,
      codeChallenge: dto.codeChallenge,
      codeChallengeMethod: dto.codeChallengeMethod,
      state: dto.state,
      ipAddress,
      userAgent,
      latitude: dto.geolocation?.latitude ?? null,
      longitude: dto.geolocation?.longitude ?? null,
    };

    if (user.twoFactorEnabled) {
      const code = CryptoUtil.generateNumericCode();
      const challengeId = CryptoUtil.generateRandomToken(24);
      await this.redisService.setJson(
        `oauth:2fa:${challengeId}`,
        { ...baseSession, twoFactorCode: code },
        300,
      );
      await this.mailService.sendTwoFactorCode(user.email, code);

      return {
        requiresTwoFactor: true,
        challengeId,
        message: 'O Código 2FA foi enviado para o seu e-mail.',
      };
    }

    return this.issueAuthorizationCodeFromSession(baseSession);
  }

  async verifyTwoFactor(dto: VerifyTwoFactorDto) {
    const key = `oauth:2fa:${dto.challengeId}`;
    const pending = await this.redisService.getJson<PendingAuthSession>(key);

    if (!pending || pending.twoFactorCode !== dto.code) {
      throw new UnauthorizedException('Código 2FA inválido ou expirado.');
    }

    await this.redisService.del(key);
    return this.issueAuthorizationCodeFromSession(pending);
  }

  async requestMagicLink(
    dto: MagicLinkRequestDto,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    await this.validateClientAndRedirect(dto.clientId, dto.redirectUri);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.warn(`Tentativa de requisição de Magic Link para e-mail não cadastrado. IP: ${ipAddress}`)
      return {
        message: `Se o e-mail estiver cadastrado em nosso sistema, será enviado um link de acesso. 
        Verifique sua caixa de entrada e/ou spam.`
      };
    }

    const magicToken = CryptoUtil.generateRandomToken(32);
    const pendingSession: PendingAuthSession = {
      userId: user.id,
      email: user.email,
      clientId: dto.clientId,
      redirectUri: dto.redirectUri,
      codeChallenge: dto.codeChallenge,
      codeChallengeMethod: dto.codeChallengeMethod,
      state: dto.state,
      ipAddress,
      userAgent,
      latitude: dto.geolocation?.latitude ?? null,
      longitude: dto.geolocation?.longitude ?? null,
    };

    await this.redisService.setJson(`oauth:magic:${magicToken}`, pendingSession, 600);

    const queryParams = new URLSearchParams({
      client_id: dto.clientId,
      redirect_uri: dto.redirectUri,
    });
    if (dto.state) queryParams.set('state', dto.state);

    await this.mailService.sendMagicLink(user.email, magicToken, queryParams.toString());

    return {
      message: 'Se o e-mail estiver cadastrado em nosso sistema, será enviado um link de acesso. Verifique sua caixa de entrada e/ou spam.',
    };
  }

  async verifyMagicLink(dto: MagicLinkVerifyDto) {
    const key = `oauth:magic:${dto.token}`;
    const pending = await this.redisService.getJson<PendingAuthSession>(key);

    if (!pending) {
      throw new UnauthorizedException('Magic Link invalido, expirado ou ja utilizado.');
    }

    await this.redisService.del(key);
    return this.issueAuthorizationCodeFromSession(pending);
  }

  private async issueAuthorizationCodeFromSession(session: PendingAuthSession) {
    const code = CryptoUtil.generateRandomToken(32);
    const codePayload: StoredAuthorizationCode = {
      userId: session.userId,
      clientId: session.clientId,
      redirectUri: session.redirectUri,
      codeChallenge: session.codeChallenge,
      codeChallengeMethod: session.codeChallengeMethod,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      latitude: session.latitude,
      longitude: session.longitude,
    };

    await this.redisService.setJson(`oauth:code:${code}`, codePayload, 300);

    const redirectUrl = new URL(session.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (session.state) {
      redirectUrl.searchParams.set('state', session.state);
    }

    return {
      requiresTwoFactor: false,
      code,
      state: session.state ?? null,
      redirectTo: redirectUrl.toString(),
    };
  }

  async exchangeToken(
    dto: TokenExchangeDto,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    if (dto.grant_type === 'authorization_code') {
      return this.handleAuthorizationCodeGrant(dto);
    }
    if (dto.grant_type === 'client_credentials') {
      return this.handleClientCredentialsGrant(dto, ipAddress, userAgent);
    }
    return this.handleRefreshTokenGrant(dto);
  }

  private async handleAuthorizationCodeGrant(
    dto: Extract<TokenExchangeDto, { grant_type: 'authorization_code' }>,
  ) {
    const client = await this.clientRepo.findOne({
      where: { clientId: dto.client_id, isActive: true },
    });
    if (!client || !client.allowedGrants.includes('authorization_code')) {
      throw new UnauthorizedException('Client nao autorizado para authorization_code.');
    }

    const codeKey = `oauth:code:${dto.code}`;
    const storedCode = await this.redisService.getJson<StoredAuthorizationCode>(codeKey);

    if (!storedCode) {
      throw new UnauthorizedException('Authorization code invalido ou expirado.');
    }

    await this.redisService.del(codeKey);

    if (storedCode.clientId !== dto.client_id || storedCode.redirectUri !== dto.redirect_uri) {
      throw new UnauthorizedException('Divergencia de client_id ou redirect_uri no code.');
    }

    const pkceValid = CryptoUtil.verifyPkceChallenge(
      dto.code_verifier,
      storedCode.codeChallenge,
      storedCode.codeChallengeMethod,
    );

    if (!pkceValid) {
      throw new UnauthorizedException('Falha na verificacao PKCE (code_verifier invalido).');
    }

    const accessTtl =
      dto.ttl_override_seconds ?? this.configService.get('ACCESS_TOKEN_TTL_SECONDS')!;
    const refreshTtl = this.configService.get('REFRESH_TOKEN_TTL_SECONDS');
    const jti = randomUUID();

    const accessToken = await this.jwtService.signAsync(
      {
        sub: storedCode.userId,
        jti,
        client_id: client.clientId,
        grant_type: 'authorization_code',
      },
      { expiresIn: accessTtl },
    );

    const refreshToken = CryptoUtil.generateRandomToken(40);
    const refreshData: StoredRefreshToken = {
      userId: storedCode.userId,
      clientId: client.clientId,
      jti,
      ipAddress: storedCode.ipAddress,
      userAgent: storedCode.userAgent,
      latitude: storedCode.latitude,
      longitude: storedCode.longitude,
    };

    await this.redisService.setJson(`oauth:refresh:${refreshToken}`, refreshData, refreshTtl);

    await this.sessionsService.registerSession({
      jti,
      userId: storedCode.userId,
      clientId: client.clientId,
      tokenContext: 'ISSUED_BY_US',
      grantType: 'authorization_code',
      ipAddress: storedCode.ipAddress,
      userAgent: storedCode.userAgent,
      latitude: storedCode.latitude,
      longitude: storedCode.longitude,
      webhookTargetUrl: client.webhookUrl,
      ttlSeconds: accessTtl,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: accessTtl,
      refresh_token: refreshToken,
      jti,
    };
  }

  private async handleClientCredentialsGrant(
    dto: Extract<TokenExchangeDto, { grant_type: 'client_credentials' }>,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const client = await this.clientRepo.findOne({
      where: { clientId: dto.client_id, isActive: true },
    });

    if (
      !client ||
      !client.allowedGrants.includes('client_credentials') ||
      !CryptoUtil.verifySecret(dto.client_secret, client.clientSecretHash)
    ) {
      throw new UnauthorizedException('Credenciais de cliente (client_credentials) invalidas.');
    }

    const accessTtl =
      dto.ttl_override_seconds ?? this.configService.get('ACCESS_TOKEN_TTL_SECONDS')!;
    const jti = randomUUID();

    const accessToken = await this.jwtService.signAsync(
      {
        sub: `client:${client.clientId}`,
        jti,
        client_id: client.clientId,
        grant_type: 'client_credentials',
      },
      { expiresIn: accessTtl },
    );

    await this.sessionsService.registerSession({
      jti,
      userId: null,
      clientId: client.clientId,
      tokenContext: 'ISSUED_BY_US',
      grantType: 'client_credentials',
      ipAddress,
      userAgent,
      latitude: dto.geolocation?.latitude ?? null,
      longitude: dto.geolocation?.longitude ?? null,
      webhookTargetUrl: dto.webhook_url ?? client.webhookUrl,
      ttlSeconds: accessTtl,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: accessTtl,
      jti,
    };
  }

  private async handleRefreshTokenGrant(
    dto: Extract<TokenExchangeDto, { grant_type: 'refresh_token' }>,
  ) {
    const refreshKey = `oauth:refresh:${dto.refresh_token}`;
    const stored = await this.redisService.getJson<StoredRefreshToken>(refreshKey);

    if (!stored || stored.clientId !== dto.client_id) {
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }

    await this.redisService.del(refreshKey);

    const client = await this.clientRepo.findOne({
      where: { clientId: dto.client_id, isActive: true },
    });
    if (!client) {
      throw new UnauthorizedException('Client inativo.');
    }

    try {
      await this.sessionsService.revokeSessionByJti(stored.jti);
    } catch {
      // Ignora caso a sessao anterior ja tenha expirado
    }

    const accessTtl =
      dto.ttl_override_seconds ?? this.configService.get('ACCESS_TOKEN_TTL_SECONDS')!;
    const refreshTtl = this.configService.get('REFRESH_TOKEN_TTL_SECONDS');
    const newJti = randomUUID();

    const accessToken = await this.jwtService.signAsync(
      {
        sub: stored.userId ?? `client:${client.clientId}`,
        jti: newJti,
        client_id: client.clientId,
        grant_type: 'refresh_token',
      },
      { expiresIn: accessTtl },
    );

    const newRefreshToken = CryptoUtil.generateRandomToken(40);
    await this.redisService.setJson(
      `oauth:refresh:${newRefreshToken}`,
      { ...stored, jti: newJti },
      refreshTtl,
    );

    await this.sessionsService.registerSession({
      jti: newJti,
      userId: stored.userId,
      clientId: client.clientId,
      tokenContext: 'ISSUED_BY_US',
      grantType: 'refresh_token',
      ipAddress: stored.ipAddress,
      userAgent: stored.userAgent,
      latitude: stored.latitude,
      longitude: stored.longitude,
      webhookTargetUrl: client.webhookUrl,
      ttlSeconds: accessTtl,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: accessTtl,
      refresh_token: newRefreshToken,
      jti: newJti,
    };
  }

  async acquireExternalProviderToken(
    dto: ExternalTokenRequestDto,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const response = await fetch(dto.providerTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: dto.clientId,
        client_secret: dto.clientSecret,
        ttl_override_seconds: dto.ttlOverrideSeconds,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new UnauthorizedException(
        `Falha ao requisitar token do provedor externo (Status ${response.status})`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      jti?: string;
    };

    const ttlSeconds =
      dto.ttlOverrideSeconds ??
      data.expires_in ??
      this.configService.get('ACCESS_TOKEN_TTL_SECONDS')!;
    const externalTrackingJti = `ext_${randomUUID()}`;

    await this.sessionsService.registerSession({
      jti: externalTrackingJti,
      userId: null,
      clientId: dto.clientId,
      tokenContext: 'ACQUIRED_EXTERNAL',
      grantType: 'client_credentials_outbound',
      ipAddress,
      userAgent,
      latitude: dto.geolocation?.latitude ?? null,
      longitude: dto.geolocation?.longitude ?? null,
      webhookTargetUrl: dto.webhookCallbackUrl,
      ttlSeconds,
    });

    return {
      acquired: true,
      trackingJti: externalTrackingJti,
      externalTokenPreview: `${data.access_token.slice(0, 24)}...`,
      expiresIn: ttlSeconds,
      webhookRegistered: dto.webhookCallbackUrl,
    };
  }

  async listClients() {
    const clients = await this.clientRepo.find({ order: { createdAt: 'ASC' } });
    return clients.map((c) => ({
      id: c.id,
      clientId: c.clientId,
      name: c.name,
      redirectUris: c.redirectUris,
      allowedGrants: c.allowedGrants,
      webhookUrl: c.webhookUrl,
      isActive: c.isActive,
    }));
  }

  async updateClientWebhook(dto: UpdateClientWebhookDto) {
    const client = await this.clientRepo.findOne({ where: { clientId: dto.clientId } });
    if (!client) {
      throw new BadRequestException('Client nao encontrado.');
    }
    client.webhookUrl = dto.webhookUrl;
    await this.clientRepo.save(client);
    return { updated: true, clientId: client.clientId, webhookUrl: client.webhookUrl };
  }
}