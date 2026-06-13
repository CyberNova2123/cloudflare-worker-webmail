/* ============================================================================
   UI KIT — icons, avatar, small helpers, toast host.
   Exported on window so the other Babel scripts can use them.
   ========================================================================== */
const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;

/* ---------------------------------------------------------------- ICONS ---
   Lucide-style 24x24 stroke icons. UI chrome only — no decorative art.       */
const ICON_PATHS = {
  inbox:   '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  star:    '<path d="M11.5 2.6 14 7.7l5.6.8-4 3.9 1 5.6-5-2.6-5 2.6 1-5.6-4-3.9 5.6-.8z"/>',
  send:    '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  file:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  alert:   '<path d="m21.7 16.5-7.5-13a2 2 0 0 0-3.4 0l-7.5 13A2 2 0 0 0 5 19.5h14a2 2 0 0 0 1.7-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  trash:   '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  search:  '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pen:     '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  settings:'<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.3.5a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.2a2 2 0 0 0-.7 2.7l.3.5a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.3-.5a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.2a2 2 0 0 0 .7-2.7l-.3-.5a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:    '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  user:    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell:    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  reply:   '<path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>',
  replyAll:'<path d="m7 17-5-5 5-5"/><path d="m12 17-5-5 5-5"/><path d="M22 18v-1a5 5 0 0 0-5-5h-7"/>',
  forward: '<path d="m15 17 5-5-5-5"/><path d="M20 12H9a5 5 0 0 0-5 5v1"/>',
  more:    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  x:       '<path d="M18 6 6 18M6 6l12 12"/>',
  check:   '<path d="M20 6 9 17l-5-5"/>',
  chevDown:'<path d="m6 9 6 6 6-6"/>',
  chevLeft:'<path d="m15 18-6-6 6-6"/>',
  menu:    '<path d="M4 6h16M4 12h16M4 18h16"/>',
  command: '<path d="M15 6a3 3 0 1 0 3 3H6a3 3 0 1 0 3-3v12a3 3 0 1 0-3-3h12a3 3 0 1 0-3 3z"/>',
  mail:    '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  shield:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  paperclip:'<path d="m21.4 11.05-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.34 3.34 0 0 1 4.71 4.71l-9.2 9.19a1.67 1.67 0 0 1-2.36-2.36l8.49-8.48"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  route:   '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  at:      '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  logout:  '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  trash2:  '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  dot:     '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  lock:    '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check2:  '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  arrowRight:'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  filter:  '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

function Icon({ name, className = "", size, style }) {
  const p = ICON_PATHS[name];
  if (!p) return null;
  return (
    <svg className={"icon " + className} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
         width={size} height={size} style={style}
         dangerouslySetInnerHTML={{ __html: p }} aria-hidden="true" />
  );
}

/* --------------------------------------------------------------- AVATAR --- */
function avatarHue(seed) {
  if (/^\d+$/.test(String(seed))) return Number(seed);
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) % 360;
  return h;
}
function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  // CJK: first char; latin: first letters
  const first = parts[0][0];
  const second = parts[1]?.[0] || (parts[0].length > 1 && /[a-z]/i.test(parts[0]) ? parts[0][1] : "");
  return (first + (second || "")).toUpperCase().slice(0, 2);
}
function Avatar({ name, email, color, size = 30 }) {
  const hue = color != null ? avatarHue(color) : avatarHue(email || name || "?");
  const bg = `oklch(0.62 0.15 ${hue})`;
  const bg2 = `oklch(0.5 0.17 ${(hue + 28) % 360})`;
  return (
    <span className="avatar" style={{
      width: size, height: size, fontSize: size * 0.4,
      background: `linear-gradient(140deg, ${bg}, ${bg2})`,
    }}>{initials(name || email)}</span>
  );
}

/* ---------------------------------------------------------------- TIME ----- */
function relTime(iso) {
  const d = new Date(iso), now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  if (diff < 86400 * 7) return d.toLocaleDateString("zh-CN", { weekday: "short" });
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}
function fullTime(iso) {
  return new Date(iso).toLocaleString("zh-CN",
    { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* --------------------------------------------------------------- TOASTS --- */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration || 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + (t.kind || "")}>
            {t.icon && <Icon name={t.icon} className="icon" />}
            <span>{t.msg}</span>
            {t.action && <button className="toast-action" onClick={() => { t.action.onClick(); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------- SMALL HELPERS - */
// Empty-state block
function Empty({ icon, title, sub }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={26} /></div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

// Loading shimmer rows for the list
function ListSkeleton({ rows = 8 }) {
  return (
    <div className="skeleton-wrap">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-row" key={i} style={{ animationDelay: i * 40 + "ms" }}>
          <div className="skel-dot" />
          <div className="grow col" style={{ gap: 7 }}>
            <div className="skel-line" style={{ width: 60 + (i % 4) * 8 + "%" }} />
            <div className="skel-line" style={{ width: 80 - (i % 3) * 10 + "%", opacity: 0.6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  Icon, Avatar, ToastHost, useToast, ToastCtx,
  relTime, fullTime, avatarHue, initials, Empty, ListSkeleton,
  useState, useEffect, useRef, useCallback,
});
