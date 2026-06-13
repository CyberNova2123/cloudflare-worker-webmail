/* ============================================================================
   SETTINGS — trimmed to what an Email Routing client needs:
     • 账户 (account/profile)
     • 发件身份与签名 (sender identities & signature, Email Sending)
     • 转发目标地址 (destination addresses, Email Routing)
     • 通知 (notifications)
   Folders/labels/filters/IMAP settings are intentionally omitted.
   ========================================================================== */

const SETTINGS_TABS = [
  { id: "account", label: "账户", icon: "user" },
  { id: "identity", label: "发件身份与签名", icon: "send" },
  { id: "destinations", label: "转发目标地址", icon: "route" },
  { id: "notifications", label: "通知", icon: "bell" },
];

function Settings({ user, onClose }) {
  const [tab, setTab] = useState("account");
  return (
    <div className="settings">
      <nav className="settings-nav">
        <button className="settings-back" onClick={onClose}><Icon name="chevLeft" /> 返回收件箱</button>
        {SETTINGS_TABS.map((t) => (
          <button key={t.id} className={"settings-item" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        <div className="settings-inner">
          {tab === "account" && <AccountSettings user={user} />}
          {tab === "identity" && <IdentitySettings />}
          {tab === "destinations" && <DestinationSettings />}
          {tab === "notifications" && <NotificationSettings />}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- ACCOUNT -------- */
function AccountSettings({ user }) {
  const toast = useToast();
  const [p, setP] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { window.API.getProfile().then(setP); }, []);
  if (!p) return <ListSkeleton rows={4} />;
  const set = (k, v) => setP({ ...p, [k]: v });
  async function save() { setSaving(true); await window.API.saveProfile(p); setSaving(false); toast("账户信息已保存", { kind: "ok", icon: "check2" }); }

  return (
    <div>
      <h1 className="settings-h">账户</h1>
      <p className="settings-desc">管理你的显示信息与本地化偏好。登录身份由 Cloudflare Access 提供，无法在此修改。</p>

      <div className="set-section">
        <div className="set-row" style={{ paddingTop: 0 }}>
          <Avatar name={p.name} email={p.email} color={p.avatarColor} size={56} />
          <div className="set-row-main">
            <div className="set-row-title">头像</div>
            <div className="set-row-sub">由显示名称自动生成。{/* Claude Code: 如需上传头像，接 R2 + PATCH /profile */}</div>
          </div>
          <button className="btn sm">更换颜色</button>
        </div>
      </div>

      <div className="set-grid">
        <div className="field">
          <label>显示名称</label>
          <input className="input" value={p.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field">
          <label>主邮箱地址</label>
          <input className="input mono" value={p.email} disabled />
          <span className="hint">由 Cloudflare Access 身份决定</span>
        </div>
        <div className="field">
          <label>时区</label>
          <select className="select" value={p.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {["Asia/Shanghai", "Asia/Tokyo", "Asia/Hong_Kong", "UTC", "America/Los_Angeles", "Europe/London"].map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
        <div className="field">
          <label>界面语言</label>
          <select className="select" value={p.locale} onChange={(e) => set("locale", e.target.value)}>
            <option value="zh-CN">简体中文</option>
            <option value="ja-JP">日本語</option>
            <option value="en-US">English</option>
          </select>
        </div>
      </div>

      <div className="save-bar">
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存更改"}</button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- IDENTITY ------- */
function IdentitySettings() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [sigId, setSigId] = useState(null);
  const [sig, setSig] = useState("");
  useEffect(() => { window.API.listIdentities().then((l) => { setList(l); const d = l.find((i) => i.isDefault) || l[0]; setSigId(d.id); setSig(d.signature || ""); }); }, []);
  if (!list) return <ListSkeleton rows={4} />;
  const active = list.find((i) => i.id === sigId);

  async function saveSig() { await window.API.saveIdentity({ ...active, signature: sig }); active.signature = sig; toast("签名已保存", { kind: "ok", icon: "check2" }); }
  function makeDefault(id) { setList(list.map((i) => ({ ...i, isDefault: i.id === id }))); toast("已设为默认发件身份", { kind: "ok", icon: "check" }); /* Claude Code: PATCH /identities/:id { isDefault:true } */ }

  return (
    <div>
      <h1 className="settings-h">发件身份与签名</h1>
      <p className="settings-desc">可用于发件的已验证别名（Email Sending）。只有完成域名 onboarding 的地址才能发信。</p>

      <div className="set-section">
        <div className="set-section-title">发件身份</div>
        {list.map((i) => (
          <div className="identity-card" key={i.id}>
            <div className="identity-head">
              <Avatar name={i.name} email={i.email} size={32} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="set-row-title">{i.name}</span>
                  {i.isDefault && <span className="chip route">默认</span>}
                </div>
                <div className="dest-mail" style={{ fontWeight: 500, color: "var(--text-3)" }}>{i.email}</div>
              </div>
              {i.verified
                ? <span className="status ok"><span className="pip" />已验证</span>
                : <span className="status pending"><span className="pip" />待验证</span>}
              {!i.isDefault && i.verified && <button className="btn sm" onClick={() => makeDefault(i.id)}>设为默认</button>}
            </div>
          </div>
        ))}
        <p className="settings-desc" style={{ margin: "10px 0 0", fontSize: 12 }}>
          {/* Claude Code: 新增发件身份 = 在 Cloudflare 控制台为域名 onboard Email Service，
              然后 POST /identities。此处不做自助添加。 */}
          需要更多发件地址？请在 Cloudflare 控制台为域名启用 Email Service。
        </p>
      </div>

      <div className="set-section">
        <div className="set-section-title">签名</div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>选择身份</label>
          <select className="select" value={sigId} onChange={(e) => { const id = e.target.value; setSigId(id); setSig(list.find((x) => x.id === id).signature || ""); }}>
            {list.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.email})</option>)}
          </select>
        </div>
        <div className="field">
          <label>签名内容</label>
          <textarea className="textarea mono" style={{ minHeight: 110 }} value={sig} onChange={(e) => setSig(e.target.value)} placeholder="输入发信时自动附加的签名…" />
          <span className="hint">发送时会自动附加到正文末尾。</span>
        </div>
        <div className="save-bar"><button className="btn primary" onClick={saveSig}>保存签名</button></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ DESTINATIONS ------ */
function DestinationSettings() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => { window.API.listDestinations().then(setList); }, []);
  if (!list) return <ListSkeleton rows={3} />;

  async function add() {
    const v = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast("请输入有效的邮箱地址", { kind: "err", icon: "alert" }); return; }
    setAdding(true);
    const d = await window.API.addDestination(v);
    setList((l) => [...l, d]); setEmail(""); setAdding(false);
    toast("验证邮件已发送至 " + v, { kind: "ok", icon: "send" });
  }
  async function resend(d) { await window.API.resendDestination(d.id); toast("已重新发送验证邮件", { kind: "ok", icon: "send" }); }
  async function remove(d) { await window.API.removeDestination(d.id); setList((l) => l.filter((x) => x.id !== d.id)); toast("已移除目标地址", { icon: "trash2" }); }

  return (
    <div>
      <h1 className="settings-h">转发目标地址</h1>
      <p className="settings-desc">Email Routing 会把发往你域名的邮件转发到这些已验证的目标地址。新增地址需通过邮件验证后才会生效。</p>

      <div className="set-section">
        {list.map((d) => (
          <div className="dest-card" key={d.id}>
            <Icon name="at" className="muted" />
            <div className="set-row-main">
              <div className="dest-mail">{d.email}</div>
              <div className="dest-meta">添加于 {new Date(d.created).toLocaleDateString("zh-CN")}</div>
            </div>
            {d.verified
              ? <span className="status ok"><span className="pip" />已验证</span>
              : <span className="status pending"><span className="pip" />待验证</span>}
            {!d.verified && <button className="btn sm" onClick={() => resend(d)}>重发验证</button>}
            <button className="btn sm ghost icon-only danger" onClick={() => remove(d)} title="移除"><Icon name="trash2" /></button>
          </div>
        ))}

        <div className="add-dest">
          <input className="input mono" placeholder="new@example.com" value={email}
                 onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn primary" onClick={add} disabled={adding} style={{ flex: "none" }}>
            {adding ? <Icon name="refresh" className="icon spin" /> : <Icon name="plus" />} 添加地址
          </button>
        </div>
        <p className="settings-desc" style={{ margin: "12px 0 0", fontSize: 12 }}>
          {/* Claude Code: POST /destinations -> 代理 Cloudflare Email Routing destination addresses API，
              Cloudflare 会向该地址发送验证邮件。验证状态轮询 GET /destinations。 */}
          添加后，Cloudflare 会向该地址发送一封验证邮件，确认后方可作为转发目标。
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- NOTIFICATIONS ------ */
const NOTIF_ITEMS = [
  { group: "推送", key: "desktop", title: "桌面通知", sub: "新邮件到达时显示系统通知（需浏览器授权）。" },
  { group: "推送", key: "sound", title: "提示音", sub: "新邮件到达时播放提示音。" },
  { group: "邮件", key: "newMail", title: "新邮件", sub: "收到路由转发的新邮件时通知我。" },
  { group: "邮件", key: "mentions", title: "提及我", sub: "邮件中点名提到我时优先通知。" },
  { group: "邮件", key: "digestDaily", title: "每日摘要", sub: "每天汇总一封未读邮件概览。" },
  { group: "路由", key: "routingAlerts", title: "路由异常告警", sub: "当转发规则失败或目标地址退信时提醒我。" },
];
function NotificationSettings() {
  const toast = useToast();
  const [n, setN] = useState(null);
  useEffect(() => { window.API.getNotifications().then(setN); }, []);
  if (!n) return <ListSkeleton rows={5} />;

  async function toggle(key) {
    const next = { ...n, [key]: !n[key] };
    setN(next);
    if (key === "desktop" && next.desktop && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (e) {}
    }
    window.API.saveNotifications(next); // Claude Code: PATCH /settings/notifications
  }

  let lastGroup = null;
  return (
    <div>
      <h1 className="settings-h">通知</h1>
      <p className="settings-desc">选择在什么情况下收到提醒。设置会同步到你的账户。</p>
      {NOTIF_ITEMS.map((item) => {
        const showGroup = item.group !== lastGroup; lastGroup = item.group;
        return (
          <div className="set-section" key={item.key} style={showGroup ? {} : { marginTop: -22 }}>
            {showGroup && <div className="set-section-title">{item.group}</div>}
            <div className="set-row" style={{ paddingTop: showGroup ? 0 : 14 }}>
              <div className="set-row-main">
                <div className="set-row-title">{item.title}</div>
                <div className="set-row-sub">{item.sub}</div>
              </div>
              <button className={"switch" + (n[item.key] ? " on" : "")} onClick={() => toggle(item.key)} aria-pressed={!!n[item.key]} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.Settings = Settings;
