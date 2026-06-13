/* ============================================================================
   APP ROOT — view routing (auth | mail | settings), global state, theme,
   keyboard shortcuts, and the command palette wiring.
   ========================================================================== */

const LS = {
  theme: "mr_theme",
  folder: "mr_folder",
};

function useTheme() {
  const [theme, setTheme] = useState(() =>
    localStorage.getItem(LS.theme) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(LS.theme, theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

function App() {
  const [theme, toggleTheme] = useTheme();
  const toast = useToast();

  // ---- session / view ----
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("mail"); // 'mail' | 'settings'

  // ---- mail state ----
  const [folder, setFolder] = useState(() => localStorage.getItem(LS.folder) || "inbox");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState({});
  const [identities, setIdentities] = useState([]);

  // ---- overlays ----
  const [compose, setCompose] = useState(null); // null | {} | {initial}
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [acctMenu, setAcctMenu] = useState(null); // null | {anchor}
  const [mobileView, setMobileView] = useState("list"); // 'list' | 'read'

  const listRef = useRef(null);
  const searchRef = useRef(null);

  const folderLabel = window.CONFIG.folders.find((f) => f.id === folder)?.label || "收件箱";

  /* ---- boot: check session ---- */
  useEffect(() => {
    window.API.getSession()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  /* ---- load identities once authed ---- */
  useEffect(() => { if (user) window.API.listIdentities().then(setIdentities); }, [user]);

  /* ---- compute unread counts for sidebar (one backend call) ---- */
  const refreshCounts = useCallback(async () => {
    try { setCounts((await window.API.getCounts()) || {}); }
    catch (e) { setCounts({}); }
  }, []);

  /* ---- load list when folder/query/user changes ---- */
  const loadList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { items } = await window.API.listMessages({ folder, q: query });
    setItems(items);
    setLoading(false);
    refreshCounts();
  }, [user, folder, query, refreshCounts]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { localStorage.setItem(LS.folder, folder); }, [folder]);

  /* ---- actions ---- */
  async function openMessage(m) {
    setSelected(m); // optimistic: list shape renders header immediately
    setMobileView("read");
    if (!m.read) {
      window.API.setMessageState(m.id, { read: true });
      m.read = true;
      setItems((arr) => arr.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
      refreshCounts();
    }
    // Hydrate the full message (bodyHtml / routing / attachments) — the list
    // shape doesn't carry them. Mock returns the full object too, so this is safe.
    try {
      const full = await window.API.getMessage(m.id);
      if (full) setSelected((s) => (s && s.id === m.id ? { ...m, ...full, read: true } : s));
    } catch (e) { /* keep the list-shape fallback */ }
  }
  function selectFolder(f) { setFolder(f); setSelected(null); setQuery(""); setView("mail"); setMobileView("list"); }

  function star(m) {
    const next = !m.starred;
    window.API.setMessageState(m.id, { starred: next });
    m.starred = next;
    setItems((arr) => arr.map((x) => (x.id === m.id ? { ...x, starred: next } : x)));
    setSelected((s) => (s && s.id === m.id ? { ...s, starred: next } : s));
  }
  function moveTo(m, dest, label) {
    window.API.setMessageState(m.id, { folder: dest });
    setItems((arr) => arr.filter((x) => x.id !== m.id));
    setSelected(null); setMobileView("list");
    if (window.__MOCK) { const o = window.__MOCK.messages.find((x) => x.id === m.id); if (o) o.folder = dest; }
    toast(label, { icon: dest === "trash" ? "trash2" : "archive", action: { label: "撤销", onClick: () => loadList() } });
    refreshCounts();
  }
  const archive = (m) => moveTo(m, "archive", "已归档");
  const del = (m) => moveTo(m, "trash", "已移到回收站");

  function reply(m, all) {
    setCompose({ initial: {
      to: m.from.email, fromId: identities.find((i) => i.email === m.routing?.to)?.id,
      subject: "Re: " + m.subject.replace(/^(Re|Fwd):\s*/i, ""),
      body: `\n\n———\n${fullTime(m.date)} ${m.from.name} 写道：\n> ${(m.preview || "").slice(0, 120)}`,
    } });
  }
  function forward(m) {
    setCompose({ initial: {
      subject: "Fwd: " + m.subject.replace(/^(Re|Fwd):\s*/i, ""),
      body: `\n\n——— 转发邮件 ———\n发件人: ${m.from.name} <${m.from.email}>\n主题: ${m.subject}\n\n${m.preview}`,
    } });
  }

  async function logout() {
    await window.API.logout();
    setUser(null); setView("mail"); setSelected(null);
    toast("已退出登录");
  }

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K — palette (works even while typing in search)
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); return; }
      if (typing) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (compose || palette || shortcuts || acctMenu) return;

      const k = e.key;
      if (k === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (k === "c" || k === "C") { e.preventDefault(); setCompose({}); }
      else if (k === "?") { e.preventDefault(); setShortcuts(true); }
      else if (k === "j" || k === "k") { e.preventDefault(); navList(k === "j" ? 1 : -1); }
      else if (k === "Enter" && selected) { setMobileView("read"); }
      else if (k === "Escape") { if (view === "settings") setView("mail"); else { setSelected(null); setMobileView("list"); } }
      else if (selected && (k === "r" || k === "R")) { e.preventDefault(); reply(selected); }
      else if (selected && (k === "e" || k === "E")) { e.preventDefault(); archive(selected); }
      else if (selected && k === "#") { e.preventDefault(); del(selected); }
      else if (selected && (k === "s" || k === "S")) { e.preventDefault(); star(selected); }
      else if (k === "D" && e.shiftKey) { e.preventDefault(); toggleTheme(); }
      else if (k === "g" || k === "G") { window.__gPrefix = Date.now(); }
      else if (window.__gPrefix && Date.now() - window.__gPrefix < 800) {
        const map = { i: "inbox", s: "starred", t: "sent", d: "drafts", e: "archive" };
        if (map[k.toLowerCase()]) { e.preventDefault(); selectFolder(map[k.toLowerCase()]); }
        window.__gPrefix = 0;
      }
    }
    function navList(dir) {
      if (!items.length) return;
      const idx = selected ? items.findIndex((x) => x.id === selected.id) : -1;
      const next = Math.max(0, Math.min(items.length - 1, idx + dir));
      openMessage(items[next]);
      // keep selected row in view without scrollIntoView
      const row = listRef.current?.children[next];
      if (row && listRef.current) {
        const r = row.getBoundingClientRect(), c = listRef.current.getBoundingClientRect();
        if (r.bottom > c.bottom) listRef.current.scrollTop += r.bottom - c.bottom + 12;
        if (r.top < c.top) listRef.current.scrollTop -= c.top - r.top + 12;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected, compose, palette, shortcuts, acctMenu, view]);

  /* ---- command palette commands ---- */
  const commands = [
    { id: "compose", group: "操作", icon: "pen", label: "写邮件", hint: "C", run: () => setCompose({}) },
    { id: "search", group: "操作", icon: "search", label: "搜索邮件", hint: "/", run: () => setTimeout(() => searchRef.current?.focus(), 50) },
    { id: "refresh", group: "操作", icon: "refresh", label: "刷新收件箱", run: loadList },
    ...window.CONFIG.folders.map((f) => ({ id: "go-" + f.id, group: "前往", icon: f.icon, label: f.label, hint: f.shortcut?.replace(" ", ""), run: () => selectFolder(f.id) })),
    { id: "settings", group: "设置", icon: "settings", label: "打开设置", run: () => setView("settings") },
    { id: "theme", group: "设置", icon: theme === "dark" ? "sun" : "moon", label: theme === "dark" ? "切换到浅色模式" : "切换到深色模式", hint: "⇧D", run: toggleTheme },
    { id: "shortcuts", group: "设置", icon: "command", label: "查看键盘快捷键", hint: "?", run: () => setShortcuts(true) },
    { id: "logout", group: "设置", icon: "logout", label: "退出登录", run: logout },
  ];

  /* ---- render ---- */
  if (booting) {
    return <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
      <div className="col" style={{ alignItems: "center", gap: 14 }}>
        <div className="brand-mark" style={{ width: 44, height: 44, fontSize: 22, animation: "pop-in 0.4s" }}>{window.CONFIG.brand.mark}</div>
        <Icon name="refresh" className="icon spin" style={{ color: "var(--text-faint)" }} />
      </div>
    </div>;
  }

  if (!user) return <LoginScreen onAuthed={(u) => { setUser(u); toast("欢迎回来", { icon: "check2", kind: "ok" }); }} />;

  if (view === "settings") {
    return <>
      <Settings user={user} onClose={() => setView("mail")} />
      {compose && <Compose identities={identities} initial={compose.initial} onClose={() => setCompose(null)} onSent={loadList} />}
    </>;
  }

  return (
    <div className="app" data-mobile-view={mobileView}>
      <Sidebar
        active={folder} onSelect={selectFolder} counts={counts} user={user}
        onCompose={() => setCompose({})} onSettings={() => setView("settings")}
        onAccount={(e) => setAcctMenu({ anchor: e.currentTarget.getBoundingClientRect() })}
        theme={theme} onToggleTheme={toggleTheme}
      />

      <MailList
        folderLabel={folderLabel} folderId={folder} items={items} loading={loading}
        selectedId={selected?.id} onSelect={openMessage}
        query={query} onQuery={setQuery} onRefresh={loadList}
        listRef={listRef} searchRef={searchRef}
      />

      <ReadingPane
        message={selected}
        onReply={reply} onForward={forward} onArchive={archive} onDelete={del} onStar={star}
        onBack={() => { setMobileView("list"); }} onCompose={() => setCompose({})}
      />

      {compose && <Compose identities={identities} initial={compose.initial} onClose={() => setCompose(null)} onSent={loadList} />}
      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
      {shortcuts && <ShortcutsModal onClose={() => setShortcuts(false)} />}
      {acctMenu && <AccountMenu user={user} anchor={acctMenu.anchor} theme={theme}
        onClose={() => setAcctMenu(null)} onSettings={() => setView("settings")}
        onToggleTheme={toggleTheme} onLogout={logout} />}
    </div>
  );
}

function Root() { return <ToastHost><App /></ToastHost>; }
ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
