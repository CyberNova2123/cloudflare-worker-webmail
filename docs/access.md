# Cloudflare Access 鉴权

登录由 **Cloudflare Access（Zero Trust）** 负责。前端没有密码框——「通过
Cloudflare Access 继续」只是把浏览器导向 Access 登录，由它跑 IdP 流程，成功后
带着 `CF_Authorization` Cookie 跳回。Worker 负责**验签这枚 JWT**。

实现见 `src/access.ts`。

## 验签流程

```
取 token：Header「Cf-Access-Jwt-Assertion」优先，否则 Cookie「CF_Authorization」
  ↓
拆 JWT（header.payload.signature），要求 alg=RS256
  ↓
拉取 JWKS：https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs（结果在 isolate 内缓存 1h）
  ↓
crypto.subtle.verify(RSASSA-PKCS1-v1_5/SHA-256) 验签
  ↓
校验声明：exp 未过期、nbf 合理、aud 含 ACCESS_AUD、iss == https://<team>
  ↓
取 payload.email → AccessUser{ email, name, sub }
```

任一步失败返回 `null`，`fetch` handler 据此回 `401`。

- **纯 Web Crypto**：不引任何 JWT 库；RSA 公钥用 `crypto.subtle.importKey("jwk", …)`
  导入。
- **JWKS 缓存**：模块级 `Map`，TTL 1 小时；Access 轮换密钥不频繁。
- **kid 匹配**：JWT header 的 `kid` 命中则只用该公钥，否则遍历全部公钥兜底。

## 配置

`wrangler.toml [vars]`：

| 变量 | 来源 |
|---|---|
| `ACCESS_TEAM_DOMAIN` | Zero Trust → Settings → Custom Pages 顶部的团队域，如 `yourteam.cloudflareaccess.com` |
| `ACCESS_AUD` | 目标 Access 应用的 **Application Audience (AUD) Tag** |

`ACCESS_AUD` 把 JWT 限定到**这个**应用——务必设置，否则同团队其它应用的 JWT 也会
被接受。

## 两种网关部署方式

1. **保护整个站点（推荐）**：Access 应用覆盖整个主机名。用户访问任何路径都先过
   Access；Worker 收到的请求总是带合法 JWT。内置登录页几乎不会出现（作兜底）。
2. **只保护 `/api`**：应用外壳公开可加载，前端 `getSession()` 收到 401 → 显示
   登录按钮 → 跳 `CONFIG.auth.loginUrl`。

无论哪种，Worker 都会**自己验签** `/api/*` 请求，不依赖边缘是否已拦截，安全性一致。

`CONFIG.auth.loginUrl` / `logoutUrl` 默认 `/cdn-cgi/access/login` /
`/cdn-cgi/access/logout`（在 `web/config.jsx`）。

## 本地开发绕过

`src/access.ts` 中，当 `DEV_BYPASS_ACCESS === "1"` 时直接返回一个开发用户
（`dev@<PRIMARY_DOMAIN>`），跳过验签，方便 `wrangler dev` 不带真实 Cookie 调
`/api`。**生产必须置 `"0"` 或删除该变量。**

## 安全说明

- 客户端**不保存** token，全靠 Access Cookie 随同源请求自动携带
  （`fetch(..., credentials:"include")`）。
- 用户 `id` 由 email 的 SHA-1 短摘要派生（`shortHash`），稳定且不暴露原文以外信息。
- `email` 字段在「账户设置」里只读——身份由 Access 决定，应用不可改。
