/* ============================================================================
   CONFIG — single place to brand & wire the app.
   Claude Code: this object is the contract surface. Most backend work touches
   only CONFIG.api.* and the functions in api.jsx.
   ========================================================================== */

window.CONFIG = {
  /* -------------------------------------------------------------------------
     BRAND — change these to re-skin the whole client. (Requested config item.)
     ---------------------------------------------------------------------- */
  brand: {
    name: "魔法纪录复兴计划 WebMail",   // full product name (sidebar header, login)
    short: "魔纪 WebMail",              // compact name (mobile, tab title)
    mark: "魔",                         // single glyph used in the logo lockup
    // Logo accent. The whole UI accent is the CSS var --accent (see styles.css);
    // keep this in sync if you change brand color.
    tagline: "Cloudflare Email Routing",
  },

  /* -------------------------------------------------------------------------
     API — base path the Worker serves the JSON API from.
     Claude Code: mount your itty-router / Hono routes under this prefix.
     All requests are same-origin and rely on the Cloudflare Access JWT cookie
     (CF_Authorization) — no bearer token is stored client-side.
     ---------------------------------------------------------------------- */
  api: {
    baseUrl: "/api",
    // Endpoints the frontend calls. Keep these in sync with api.jsx.
    endpoints: {
      session:       "/auth/session",        // GET  -> current user (or 401)
      logout:        "/auth/logout",         // POST -> clears session
      messages:      "/messages",            // GET  ?folder=&q=&cursor=
      counts:        "/messages/counts",     // GET  -> { folderId: unreadCount }
      message:       "/messages/:id",        // GET  full message + raw routing meta
      messageState:  "/messages/:id/state",  // PATCH { read, starred, folder }
      send:          "/messages/send",       // POST -> Email Service (Email Sending)
      identities:    "/identities",          // GET/POST/PATCH verified send-from aliases
      destinations:  "/destinations",        // GET/POST/DELETE Email Routing destinations
      destVerify:    "/destinations/:id/resend", // POST resend verification email
      profile:       "/profile",             // GET/PATCH account profile
      notifications: "/settings/notifications", // GET/PATCH notification prefs
    },
  },

  /* -------------------------------------------------------------------------
     AUTH — Cloudflare Access (Zero Trust) SSO.
     Claude Code: protect the Worker route (or the whole app) with an Access
     application. The "Continue with Cloudflare Access" button just navigates to
     loginUrl; Access handles the IdP dance and returns with a CF_Authorization
     cookie. After redirect, the app calls endpoints.session to hydrate the user.
     ---------------------------------------------------------------------- */
  auth: {
    provider: "Cloudflare Access",
    // Where the SSO button sends the browser. Typically your Access-protected
    // app root, optionally with a redirect back. Example:
    //   https://webmail.example.com/cdn-cgi/access/login/<aud>?redirect_url=/
    loginUrl: "/cdn-cgi/access/login",
    // Where logout sends the browser after clearing the session.
    logoutUrl: "/cdn-cgi/access/logout",
  },

  /* -------------------------------------------------------------------------
     FEATURE FLAGS — trimmed for an Email Routing-only client.
     (Folders/labels/threading-heavy IMAP features intentionally omitted.)
     ---------------------------------------------------------------------- */
  features: {
    sending: true,        // compose & send via Email Service (Email Sending binding)
    search: true,
    desktopNotifications: true,
    catchAll: false,      // hidden by request — flip on if you manage catch-all here
  },

  /* Folders surfaced in the sidebar. For Email Routing these map to logical
     buckets your Worker computes — they are NOT IMAP folders. */
  folders: [
    { id: "inbox",   label: "收件箱",   icon: "inbox",   shortcut: "g i" },
    { id: "starred", label: "已加星标", icon: "star",    shortcut: "g s" },
    { id: "sent",    label: "已发送",   icon: "send",    shortcut: "g t" },
    { id: "drafts",  label: "草稿",     icon: "file",    shortcut: "g d" },
    { id: "archive", label: "归档",     icon: "archive", shortcut: "g e" },
    { id: "spam",    label: "垃圾邮件", icon: "alert",   shortcut: null  },
    { id: "trash",   label: "回收站",   icon: "trash",   shortcut: null  },
  ],

  // Polling fallback (ms) if you don't wire a WebSocket/Durable Object stream.
  pollInterval: 60000,
};
