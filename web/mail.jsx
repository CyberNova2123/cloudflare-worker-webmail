/* ============================================================================
   MAIL — sidebar (rail), message list, reading pane.
   The reading pane is "routing-aware": it surfaces which alias the message was
   addressed to (Email Routing) and the SPF/DKIM/DMARC auth result, which is the
   detail that matters for a routing-only client.
   ========================================================================== */

/* Human-readable byte size for attachment cards. */
function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}

/* ----------------------------------------------------------- SIDEBAR ------ */
function Sidebar({ active, onSelect, counts, user, onCompose, onSettings, onAccount, theme, onToggleTheme }) {
  const B = window.CONFIG.brand;
  const folders = window.CONFIG.folders;
  return (
    <nav className="pane pane-rail">
      <div className="brand">
        <div className="brand-mark">{B.mark}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="brand-name truncate">{B.short}</div>
          <div className="brand-tag"><Icon name="route" size={10} /> {B.tagline}</div>
        </div>
      </div>

      <button className="btn primary compose-btn" onClick={onCompose} title="写邮件 · C">
        <Icon name="pen" /> <span>写邮件</span>
      </button>

      <div className="nav">
        {folders.map((f) => (
          <button key={f.id} className={"nav-item" + (active === f.id ? " active" : "")} onClick={() => onSelect(f.id)}>
            <Icon name={f.icon} />
            <span className="grow truncate">{f.label}</span>
            {counts[f.id] > 0 && f.id !== "starred"
              ? <span className="nav-count">{counts[f.id]}</span>
              : f.shortcut && <span className="kbd nav-kbd">{f.shortcut.replace(" ", "")}</span>}
          </button>
        ))}
      </div>

      <div className="rail-foot col" style={{ gap: 2 }}>
        <button className="nav-item" onClick={onToggleTheme}>
          <Icon name={theme === "dark" ? "sun" : "moon"} />
          <span className="grow truncate">{theme === "dark" ? "浅色模式" : "深色模式"}</span>
          <span className="kbd nav-kbd">⇧D</span>
        </button>
        <button className="nav-item" onClick={onSettings}>
          <Icon name="settings" />
          <span className="grow truncate">设置</span>
        </button>
        <button className="acct" onClick={onAccount}>
          <Avatar name={user.name} email={user.email} color={user.avatarColor} size={30} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="acct-name truncate">{user.name}</div>
            <div className="acct-mail truncate">{user.email}</div>
          </div>
          <Icon name="chevDown" size={14} className="muted" />
        </button>
      </div>
    </nav>
  );
}

/* ----------------------------------------------------------- LIST --------- */
function MailList({ folderLabel, folderId, items, loading, selectedId, onSelect, query, onQuery, onRefresh, listRef, searchRef }) {
  const unread = items.filter((m) => !m.read).length;
  return (
    <section className="pane pane-list">
      <div className="list-head">
        <div className="list-title-row">
          <span className="list-title grow">{folderLabel}</span>
          <span className="list-sub">{unread > 0 ? unread + " 封未读" : items.length + " 封"}</span>
          <button className="iconbtn" onClick={onRefresh} title="刷新"><Icon name="refresh" /></button>
        </div>
        <div className="search">
          <Icon name="search" />
          <input ref={searchRef} value={query} placeholder="搜索邮件…  （按 / 聚焦）"
                 onChange={(e) => onQuery(e.target.value)} />
          {query && <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={() => onQuery("")}><Icon name="x" size={13} /></button>}
        </div>
      </div>

      <div className="maillist" ref={listRef}>
        {loading ? <ListSkeleton /> :
          items.length === 0 ? <Empty icon="inbox" title={query ? "没有匹配的邮件" : "这里空空如也"} sub={query ? "试试别的关键词" : "新的路由邮件会出现在这里"} /> :
          items.map((m) => (
            <article key={m.id} className={"mailrow" + (selectedId === m.id ? " sel" : "") + (m.read ? "" : " unread")}
                     onClick={() => onSelect(m)}>
              {!m.read && <span className="mr-unreaddot" />}
              <Avatar name={m.from.name} email={m.from.email} size={34} />
              <div className="mr-main">
                <div className="mr-top">
                  <span className="mr-from truncate">{m.from.name}</span>
                  <span className="mr-time">{relTime(m.date)}</span>
                </div>
                <div className="mr-subject truncate">{m.subject}</div>
                <div className="mr-preview truncate">{m.preview}</div>
                <div className="mr-meta">
                  <span className="chip route mono"><Icon name="at" size={11} />{m.routedFrom}</span>
                  {m.starred && <span className="mr-star"><Icon name="star" size={13} /></span>}
                  {m.hasAttachment && <span className="mr-attach row" style={{ gap: 2 }}><Icon name="paperclip" size={13} />{m.attachmentCount || ""}</span>}
                </div>
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- READING ------ */
function AuthPill({ label, value }) {
  const ok = value === "pass";
  if (value === "—" || value == null) return null;
  return <span className={"auth-pill " + (ok ? "pass" : "fail")}><Icon name={ok ? "check" : "x"} size={10} />{label}</span>;
}

function ReadingPane({ message, onReply, onForward, onArchive, onDelete, onStar, onBack, onCompose }) {
  if (!message) {
    return (
      <section className="pane pane-read">
        <div className="read-empty">
          <Empty icon="mail" title="选择一封邮件" sub="从左侧列表选择邮件查看详情，或按 C 写新邮件。" />
        </div>
      </section>
    );
  }
  const r = message.routing || {};
  const isSentLike = message.folder === "sent" || message.folder === "drafts";
  return (
    <section className="pane pane-read">
      {/* mobile back bar */}
      <div className="mobile-bar">
        <button className="iconbtn" onClick={onBack}><Icon name="chevLeft" /></button>
        <span className="grow truncate" style={{ fontWeight: 650 }}>{message.subject}</span>
      </div>

      <div className="read-head">
        <div className="read-actions">
          <button className="btn sm" onClick={() => onReply(message)}><Icon name="reply" /> 回复</button>
          <button className="btn sm ghost icon-only" onClick={() => onReply(message, true)} title="全部回复"><Icon name="replyAll" /></button>
          <button className="btn sm ghost icon-only" onClick={() => onForward(message)} title="转发"><Icon name="forward" /></button>
          <span className="sep" />
          <button className={"btn sm ghost icon-only" + (message.starred ? " active" : "")} onClick={() => onStar(message)} title="加星标">
            <Icon name="star" style={message.starred ? { fill: "var(--amber)", stroke: "var(--amber)" } : null} />
          </button>
          <button className="btn sm ghost icon-only" onClick={() => onArchive(message)} title="归档 · E"><Icon name="archive" /></button>
          <button className="btn sm ghost icon-only" onClick={() => onDelete(message)} title="删除 · #"><Icon name="trash2" /></button>
        </div>

        <h1 className="read-subject">{message.subject}</h1>

        <div className="read-from-row">
          <Avatar name={message.from.name} email={message.from.email} size={40} />
          <div className="read-from-meta">
            <div className="read-from-name">{message.from.name}</div>
            <div className="read-from-mail mono">&lt;{message.from.email}&gt;</div>
            {!isSentLike && <div className="read-to">发往 <span className="mono">{r.to || message.routedFrom}</span></div>}
          </div>
          <div className="read-date">{fullTime(message.date)}</div>
        </div>
      </div>

      {/* Routing inspector — the Email Routing signal for this message */}
      {!isSentLike && (
        <div className="routing-bar" style={{ marginTop: 14 }}>
          <Icon name="route" size={14} className="muted" />
          <span className="rb-flow">
            <span className="mono">{message.routedFrom}</span>
            <Icon name="arrowRight" size={12} className="muted" />
            <span style={{ color: "var(--text-3)" }}>Cloudflare</span>
            <Icon name="arrowRight" size={12} className="muted" />
            <span className="mono">收件箱</span>
          </span>
          <div className="grow" />
          <AuthPill label="SPF" value={r.spf} />
          <AuthPill label="DKIM" value={r.dkim} />
          <AuthPill label="DMARC" value={r.dmarc} />
        </div>
      )}

      <div className="read-body scroll">
        {/* Body HTML is sanitized server-side (Worker, src/email/sanitize.ts)
            before it is stored, so what arrives here is already cleaned. */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: message.bodyHtml || "<p>(无正文)</p>" }} />

        {message.hasAttachment && (
          <div className="attach-strip">
            {(message.attachments && message.attachments.length
              ? message.attachments
              : Array.from({ length: message.attachmentCount || 1 }).map((_, i) => ({
                  idx: i, filename: `附件_${i + 1}.${["pdf", "png", "zip"][i % 3]}`, size: (120 + i * 64) * 1024,
                }))
            ).map((a, i) => {
              const inner = <>
                <Icon name="paperclip" />
                <div>
                  <div className="attach-name truncate">{a.filename}</div>
                  <div className="attach-size">{fmtSize(a.size)}</div>
                </div>
              </>;
              return a.url
                ? <a className="attach-card" key={i} href={a.url} download={a.filename}
                     title="下载附件" style={{ textDecoration: "none", color: "inherit" }}>{inner}</a>
                : <div className="attach-card" key={i}>{inner}</div>;
            })}
          </div>
        )}
      </div>

      {!isSentLike && (
        <button className="read-reply" onClick={() => onReply(message)}>
          <Icon name="reply" size={15} />
          <span>回复 {message.from.name}…</span>
        </button>
      )}
    </section>
  );
}

Object.assign(window, { Sidebar, MailList, ReadingPane });
