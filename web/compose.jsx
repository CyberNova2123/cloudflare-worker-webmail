/* ============================================================================
   COMPOSE — outbound mail via Cloudflare Email Service (Email Sending).
   Claude Code: on Send this calls API.sendMessage(draft). The `from` selector
   only lists VERIFIED identities (a domain onboarded to Email Service); sending
   from an unverified alias will be rejected by the Worker.
   ========================================================================== */

function Compose({ identities, initial, onClose, onSent }) {
  const toast = useToast();
  const def = identities.find((i) => i.isDefault && i.verified) || identities.find((i) => i.verified) || identities[0];
  const [fromId, setFromId] = useState((initial && initial.fromId) || def.id);
  const [to, setTo] = useState(initial?.to || "");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(initial?.subject || "");
  const [body, setBody] = useState(initial?.body || "");
  const [sending, setSending] = useState(false);
  const toRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => { (initial?.subject ? bodyRef : toRef).current?.focus(); }, []);

  const ident = identities.find((i) => i.id === fromId);

  async function send() {
    if (!to.trim()) { toast("请填写收件人", { kind: "err", icon: "alert" }); toRef.current?.focus(); return; }
    setSending(true);
    try {
      // Email Sending payload — see api.jsx / POST /messages/send
      await window.API.sendMessage({
        fromIdentityId: fromId,
        to: to.split(/[,;\s]+/).filter(Boolean),
        cc: cc.split(/[,;\s]+/).filter(Boolean),
        subject,
        bodyText: body + (ident?.signature ? "\n\n" + ident.signature : ""),
      });
      toast("邮件已发送", { kind: "ok", icon: "check2" });
      onSent && onSent();
      onClose();
    } catch (e) {
      toast("发送失败：" + (e.message || "未知错误"), { kind: "err", icon: "alert" });
      setSending(false);
    }
  }

  // Cmd/Ctrl+Enter to send
  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); }
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="compose" onKeyDown={onKey}>
        <div className="compose-head">
          <Icon name="pen" size={15} className="muted" />
          <span className="title grow">{initial?.subject ? "回复 / 转发" : "写邮件"}</span>
          <button className="iconbtn" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="compose-fields">
          <div className="compose-field">
            <label>发件人</label>
            <select className="grow" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {identities.map((i) => (
                <option key={i.id} value={i.id} disabled={!i.verified}>
                  {i.name} &lt;{i.email}&gt;{i.verified ? "" : "（未验证）"}
                </option>
              ))}
            </select>
          </div>
          <div className="compose-field">
            <label>收件人</label>
            <input ref={toRef} className="grow" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" />
            {!showCc && <button className="btn sm ghost" onClick={() => setShowCc(true)}>抄送</button>}
          </div>
          {showCc && (
            <div className="compose-field">
              <label>抄送</label>
              <input className="grow" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" />
            </div>
          )}
          <div className="compose-field">
            <label>主题</label>
            <input className="grow" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="主题" />
          </div>
        </div>

        <div className="compose-body">
          <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} placeholder="写点什么…" />
        </div>

        <div className="compose-foot">
          <button className="btn primary" onClick={send} disabled={sending}>
            {sending ? <><Icon name="refresh" className="icon spin" /> 发送中…</> : <><Icon name="send" /> 发送</>}
          </button>
          <span className="kbd">⌘↵</span>
          <div className="grow" />
          {ident && <span className="chip route mono"><Icon name="at" size={11} />{ident.email}</span>}
          <button className="iconbtn" title="附件（待接入）"><Icon name="paperclip" /></button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ PALETTE ===== */
function CommandPalette({ commands, onClose }) {
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = commands.filter((c) => (c.label + (c.group || "") + (c.keywords || "")).toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { setCur(0); }, [q]);

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(c + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); filtered[cur]?.run(); onClose(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  // group consecutive
  let lastGroup = null;
  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" onKeyDown={onKey}>
        <div className="palette-input">
          <Icon name="command" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="输入命令或搜索…" />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-list">
          {filtered.length === 0 && <div className="palette-group" style={{ padding: 16 }}>没有匹配的命令</div>}
          {filtered.map((c, i) => {
            const showGroup = c.group && c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <React.Fragment key={c.id}>
                {showGroup && <div className="palette-group">{c.group}</div>}
                <div className={"palette-item" + (i === cur ? " cur" : "")}
                     onMouseEnter={() => setCur(i)} onClick={() => { c.run(); onClose(); }}>
                  <Icon name={c.icon} />
                  <span className="pi-label">{c.label}</span>
                  {c.hint && <span className="pi-hint kbd">{c.hint}</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- SHORTCUTS ----- */
const SHORTCUTS = [
  { k: ["⌘", "K"], label: "命令面板" },
  { k: ["C"], label: "写邮件" },
  { k: ["/"], label: "搜索" },
  { k: ["J"], label: "下一封" },
  { k: ["K"], label: "上一封" },
  { k: ["↵"], label: "打开邮件" },
  { k: ["R"], label: "回复" },
  { k: ["E"], label: "归档" },
  { k: ["#"], label: "删除" },
  { k: ["S"], label: "加星标" },
  { k: ["G", "I"], label: "前往收件箱" },
  { k: ["⇧", "D"], label: "切换深/浅色" },
  { k: ["?"], label: "快捷键帮助" },
  { k: ["Esc"], label: "关闭 / 返回" },
];
function ShortcutsModal({ onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="shortcuts">
        <div className="shortcuts-head">
          <strong style={{ fontSize: 15 }}>键盘快捷键</strong>
          <button className="iconbtn" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="shortcuts-grid">
          {SHORTCUTS.map((s, i) => (
            <div className="sc-row" key={i}>
              <span className="sc-label">{s.label}</span>
              <span className="sc-keys">{s.k.map((k, j) => <span className="kbd" key={j}>{k}</span>)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- ACCOUNT POP --- */
function AccountMenu({ user, anchor, onClose, onSettings, onLogout, onToggleTheme, theme }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const style = anchor
    ? { left: anchor.left, bottom: window.innerHeight - anchor.top + 8 }
    : { left: 16, bottom: 70 };
  return (
    <div className="popover" ref={ref} style={style}>
      <div className="pop-head">
        <Avatar name={user.name} email={user.email} color={user.avatarColor} size={36} />
        <div style={{ minWidth: 0 }}>
          <div className="acct-name truncate">{user.name}</div>
          <div className="acct-mail truncate">{user.email}</div>
        </div>
      </div>
      <div className="pop-sep" />
      <button className="pop-item" onClick={() => { onSettings(); onClose(); }}><Icon name="settings" /> 设置</button>
      <button className="pop-item" onClick={() => { onToggleTheme(); }}>
        <Icon name={theme === "dark" ? "sun" : "moon"} /> {theme === "dark" ? "切换到浅色" : "切换到深色"}
      </button>
      <div className="pop-sep" />
      <button className="pop-item danger" onClick={() => { onLogout(); onClose(); }}><Icon name="logout" /> 退出登录</button>
    </div>
  );
}

Object.assign(window, { Compose, CommandPalette, ShortcutsModal, AccountMenu });
