/** User identity returned by exchangeCode(). `user_id` is the stable, provider-agnostic id. */
export interface AuthUser {
  user_id: string;
  provider: string;
  nickname?: string;
  avatar?: string;
}

/**
 * One entry from GET /api/providers — data-driven, so providers are not hardcoded in the SDK.
 * authorizeEndpoint 是该 provider 对应的 bff origin（取自 admin 在
 * platform_provider_status.bff_origin 按 provider 配置的网址）。sdk 拿到后跳
 * `${authorizeEndpoint}/authorize?...`。
 */
export interface ProviderInfo {
  id: string;
  authorizeEndpoint: string;
}
