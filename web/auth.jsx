/* ============================================================================
   AUTH SCREEN — Cloudflare Access (Zero Trust) SSO sign-in.
   Claude Code: the button calls API.loginWithAccess(), which in production just
   navigates the browser to CONFIG.auth.loginUrl. Access runs the IdP flow and
   redirects back with the CF_Authorization cookie; App.jsx then re-checks the
   session. The form below is intentionally minimal — Access owns the credential
   UX, so there is no password field to maintain here.
   ========================================================================== */

function LoginScreen({ onAuthed }) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const B = window.CONFIG.brand;

  async function signIn() {
    setLoading(true);
    try {
      await window.API.loginWithAccess(); // real build: navigates away (no resolve)
      const user = await window.API.getSession();
      onAuthed(user);
    } catch (e) {
      toast("登录失败，请重试", { kind: "err", icon: "alert" });
      setLoading(false);
    }
  }

  return (
    <div className="login">
      {/* ---- Left: brand panel (hidden on mobile) ---- */}
      <aside className="login-aside">
        <div className="login-brand">
          <div className="brand-mark">{B.mark}</div>
          <div>
            <div className="brand-name" style={{ fontSize: 15 }}>{B.name}</div>
            <div className="brand-tag"><Icon name="route" size={11} /> {B.tagline}</div>
          </div>
        </div>

        <div className="login-hero">
          <h1>收发一体的<br />域名邮箱客户端</h1>
          <p>基于 Cloudflare Email Routing 接收，借助 Email Service 直接从你的域名安全发件 —— 全程无需管理服务器。</p>
          <div className="login-points">
            <div className="login-point"><span className="lp-ic"><Icon name="inbox" size={14} /></span>路由收件，按别名归类到统一收件箱</div>
            <div className="login-point"><span className="lp-ic"><Icon name="send" size={14} /></span>SPF / DKIM 自动配置，发件直达收件箱</div>
            <div className="login-point"><span className="lp-ic"><Icon name="shield" size={14} /></span>由 Cloudflare Access 零信任保护登录</div>
          </div>
        </div>

        <div className="login-foot">{B.tagline} · powered by Cloudflare Workers</div>
      </aside>

      {/* ---- Right: sign-in card ---- */}
      <main className="login-main">
        <div className="login-card">
          <div className="login-brand" style={{ marginBottom: 28 }}>
            <div className="brand-mark" style={{ width: 34, height: 34, fontSize: 17 }}>{B.mark}</div>
            <div className="brand-name" style={{ fontSize: 14 }}>{B.short}</div>
          </div>

          <h2>登录到收件箱</h2>
          <p className="sub">使用组织的单点登录账户继续。</p>

          {/* SSO button — the only credential entry point. */}
          <button className="btn primary sso-btn" onClick={signIn} disabled={loading}>
            {loading
              ? <><Icon name="refresh" className="icon spin" /> 正在跳转到 Access…</>
              : <><Icon name="shield" /> 通过 Cloudflare Access 继续</>}
          </button>

          <div className="sso-or">受保护的登录</div>

          <div className="login-note">
            <Icon name="lock" size={15} />
            <span>
              身份验证由 <b>Cloudflare Access</b> 处理。授权后浏览器会携带
              <span className="mono"> CF_Authorization </span>
              会话凭据返回，本客户端不会保存任何密码。
            </span>
          </div>

          <div className="login-legal">
            继续即表示你同意组织的<a>使用政策</a>与<a>隐私声明</a>。
          </div>
        </div>
      </main>
    </div>
  );
}

window.LoginScreen = LoginScreen;
