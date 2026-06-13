/* ============================================================================
   API LAYER — the single seam between UI and backend.
   ----------------------------------------------------------------------------
   Claude Code: each function currently resolves MOCK data after a short delay so
   the prototype runs standalone. To go live, replace the body of each function
   with the marked fetch() call (already written, just commented) and delete the
   mock branch. Response shapes are documented inline — keep them stable and the
   UI needs zero changes.

   Wire-up checklist on the Worker:
     • Protect routes with Cloudflare Access (CF_Authorization cookie).
     • Email Routing (inbound) -> persist parsed messages (Postal MIME / R2 for
       raw + attachments, D1/KV for metadata) so this API can list/read them.
     • Email Sending  (outbound) -> bind the Email Service `SEND_EMAIL` binding
       (or REST API) and implement POST /messages/send.
     • Destinations   -> proxy the Cloudflare API for Email Routing destination
       addresses (list / create / delete / resend-verification).
   ========================================================================== */

(function () {
  const { baseUrl } = window.CONFIG.api;
  // Live when served by the Worker (it injects window.__WEBMAIL_LIVE__); falls
  // back to MOCK when the files are opened standalone (file://) for previewing.
  const USE_MOCK = !window.__WEBMAIL_LIVE__;
  const EP = window.CONFIG.api.endpoints;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // Thin fetch helper. Same-origin; Access cookie rides along automatically.
  async function http(path, { method = "GET", body, query } = {}) {
    const url = new URL(baseUrl + path, location.origin);
    if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
    const res = await fetch(url, {
      method,
      credentials: "include", // send CF_Authorization
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) throw Object.assign(new Error("unauthenticated"), { code: 401 });
    if (!res.ok) throw Object.assign(new Error("http " + res.status), { code: res.status });
    return res.status === 204 ? null : res.json();
  }

  const API = {
    /* ---------------------------------------------------------------- AUTH */
    // GET /auth/session -> { id, name, email, avatarColor, primaryDomain }
    // Returns 401 when the Access cookie is missing/expired -> show login.
    async getSession() {
      if (!USE_MOCK) return http(EP.session);
      await delay(260);
      if (localStorage.getItem("mr_authed") !== "1")
        throw Object.assign(new Error("unauthenticated"), { code: 401 });
      return MOCK.user;
    },

    // The SSO button navigates the browser to Access; nothing to fetch here.
    // After Access redirects back, getSession() hydrates the user.
    loginWithAccess() {
      if (USE_MOCK) { localStorage.setItem("mr_authed", "1"); return Promise.resolve(); }
      location.href = CONFIG.auth.loginUrl; // real redirect
    },

    // POST /auth/logout then bounce through Access logout.
    async logout() {
      if (!USE_MOCK) {
        try { await http(EP.logout, { method: "POST" }); } catch (e) { /* ignore */ }
        location.href = CONFIG.auth.logoutUrl;
        return;
      }
      localStorage.removeItem("mr_authed");
      await delay(120);
    },

    /* ------------------------------------------------------------ MESSAGES */
    // GET /messages?folder=&q=&cursor= -> { items: Message[], nextCursor }
    // Message (list shape): { id, folder, from:{name,email}, to, subject,
    //   preview, date(ISO), read, starred, hasAttachment, attachmentCount,
    //   routedFrom (the alias the mail was addressed to, e.g. hi@domain),
    //   routedVia (cloudflare), labels:[] }
    async listMessages({ folder = "inbox", q = "" } = {}) {
      if (!USE_MOCK) return http(EP.messages, { query: { folder, q } });
      await delay(220);
      let items = MOCK.messages.filter((m) =>
        folder === "starred" ? m.starred : m.folder === folder
      );
      if (q) {
        const s = q.toLowerCase();
        items = items.filter((m) =>
          (m.subject + m.from.name + m.from.email + m.preview + m.routedFrom)
            .toLowerCase().includes(s)
        );
      }
      items = items.sort((a, b) => new Date(b.date) - new Date(a.date));
      return { items, nextCursor: null };
    },

    // GET /messages/counts -> { folderId: unreadCount } for the sidebar badges.
    async getCounts() {
      if (!USE_MOCK) return http(EP.counts);
      await delay(60);
      const c = {};
      MOCK.messages.forEach((m) => { if (!m.read) c[m.folder] = (c[m.folder] || 0) + 1; });
      return c;
    },

    // GET /messages/:id -> full Message + { bodyHtml, headers, routing:{
    //   to, dkim:'pass'|'fail', spf, dmarc } } for the routing inspector.
    async getMessage(id) {
      if (!USE_MOCK) return http(EP.message.replace(":id", id));
      await delay(160);
      return MOCK.messages.find((m) => m.id === id) || null;
    },

    // PATCH /messages/:id/state { read?, starred?, folder? } -> updated Message
    async setMessageState(id, patch) {
      if (!USE_MOCK) return http(EP.messageState.replace(":id", id), { method: "PATCH", body: patch });
      await delay(80);
      const m = MOCK.messages.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
      return m;
    },

    // POST /messages/send -> { id } | error
    // body: { fromIdentityId, to:[], cc:[], bcc:[], subject, bodyText, bodyHtml }
    // Claude Code: this is the Email Service (Email Sending) call. From-address
    // MUST be a verified identity on a domain onboarded to Email Service.
    async sendMessage(draft) {
      if (!USE_MOCK) return http(EP.send, { method: "POST", body: draft });
      await delay(900);
      return { id: "snt_" + Date.now() };
    },

    /* ---------------------------------------------------- SENDER IDENTITIES */
    // GET /identities -> Identity[] { id, name, email, isDefault, verified }
    // These are the verified "send from" aliases (Email Sending senders).
    async listIdentities() {
      if (!USE_MOCK) return http(EP.identities);
      await delay(140);
      return MOCK.identities;
    },
    // PATCH /identities/:id  /  POST /identities  (signature, default flag)
    async saveIdentity(identity) {
      if (!USE_MOCK) {
        return identity.id
          ? http(EP.identities + "/" + identity.id, { method: "PATCH", body: identity })
          : http(EP.identities, { method: "POST", body: identity });
      }
      await delay(200);
      return identity;
    },

    /* -------------------------------------------------- DESTINATION ADDRESSES */
    // GET /destinations -> Destination[] { id, email, verified, created(ISO) }
    // Proxies Cloudflare Email Routing "destination addresses".
    async listDestinations() {
      if (!USE_MOCK) return http(EP.destinations);
      await delay(180);
      return MOCK.destinations;
    },
    // POST /destinations { email } -> Destination (triggers verification email)
    async addDestination(email) {
      if (!USE_MOCK) return http(EP.destinations, { method: "POST", body: { email } });
      await delay(500);
      const d = { id: "dst_" + Date.now(), email, verified: false, created: new Date().toISOString() };
      MOCK.destinations.push(d);
      return d;
    },
    // POST /destinations/:id/resend -> re-triggers the verification email
    async resendDestination(id) {
      if (!USE_MOCK) { await http(EP.destVerify.replace(":id", id), { method: "POST" }); return true; }
      await delay(400); return true;
    },
    // DELETE /destinations/:id -> 204
    async removeDestination(id) {
      if (!USE_MOCK) { await http(EP.destinations + "/" + id, { method: "DELETE" }); return true; }
      await delay(300);
      MOCK.destinations = MOCK.destinations.filter((d) => d.id !== id);
      return true;
    },

    /* ------------------------------------------------------------- PROFILE */
    // GET/PATCH /profile -> { name, email, timezone, locale, avatarColor }
    async getProfile() {
      if (!USE_MOCK) return http(EP.profile);
      await delay(120); return MOCK.profile;
    },
    async saveProfile(p) {
      if (!USE_MOCK) return http(EP.profile, { method: "PATCH", body: p });
      await delay(220); Object.assign(MOCK.profile, p); return MOCK.profile;
    },

    /* ------------------------------------------------------- NOTIFICATIONS */
    // GET/PATCH /settings/notifications -> see MOCK.notifications shape
    async getNotifications() {
      if (!USE_MOCK) return http(EP.notifications);
      await delay(120); return MOCK.notifications;
    },
    async saveNotifications(n) {
      if (!USE_MOCK) return http(EP.notifications, { method: "PATCH", body: n });
      await delay(180); Object.assign(MOCK.notifications, n); return MOCK.notifications;
    },
  };

  /* ==========================================================================
     MOCK DATA — delete once the backend is wired (USE_MOCK=false).
     ======================================================================== */
  const now = Date.now();
  const ago = (mins) => new Date(now - mins * 60000).toISOString();

  const MOCK = {
    user: {
      id: "usr_001",
      name: "调查员 Kasen",
      email: "kasen@magireco.app",
      avatarColor: "295",
      primaryDomain: "magireco.app",
    },
    profile: {
      name: "调查员 Kasen",
      email: "kasen@magireco.app",
      timezone: "Asia/Shanghai",
      locale: "zh-CN",
      avatarColor: "295",
    },
    identities: [
      { id: "idn_1", name: "调查员 Kasen", email: "kasen@magireco.app", isDefault: true,  verified: true,
        signature: "— Kasen\n魔法纪录复兴计划 · 神浜调查部" },
      { id: "idn_2", name: "复兴计划支援",  email: "support@magireco.app", isDefault: false, verified: true,
        signature: "魔法纪录复兴计划 · 支援窗口" },
      { id: "idn_3", name: "活动通知",      email: "no-reply@magireco.app", isDefault: false, verified: false, signature: "" },
    ],
    destinations: [
      { id: "dst_1", email: "kasen.personal@gmail.com",   verified: true,  created: ago(60 * 24 * 40) },
      { id: "dst_2", email: "kasen@protonmail.com",        verified: true,  created: ago(60 * 24 * 12) },
      { id: "dst_3", email: "team-archive@outlook.com",    verified: false, created: ago(60 * 6) },
    ],
    notifications: {
      desktop: true,
      sound: false,
      newMail: true,
      mentions: true,
      digestDaily: false,
      routingAlerts: true,   // alert when a routing rule fails / destination bounces
      marketing: false,
    },
    messages: [
      { id: "m1", folder: "inbox", read: false, starred: true, hasAttachment: false,
        from: { name: "Cloudflare", email: "noreply@notify.cloudflare.com" },
        routedFrom: "hi@magireco.app", routedVia: "cloudflare",
        subject: "Your Email Routing is now sending too",
        preview: "Email Sending just hit public beta — reply to routed mail directly from your domain, no API keys.",
        date: ago(14),
        bodyHtml: "<p>Hi there,</p><p>Good news — <b>Email Sending</b> is now in public beta. Your domain <code>magireco.app</code> can now both receive (Email Routing) and send mail from a single Cloudflare service.</p><p>This webmail client is already wired for it: hit <b>Reply</b> on any routed message and it goes out authenticated with SPF + DKIM, configured automatically.</p><p>— The Cloudflare Email team</p>",
        routing: { to: "hi@magireco.app", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m2", folder: "inbox", read: false, starred: false, hasAttachment: true, attachmentCount: 2,
        from: { name: "环 いろは", email: "iroha@kamihama.jp" },
        routedFrom: "contact@magireco.app", routedVia: "cloudflare",
        subject: "神浜市調査レポート — 第3区画",
        preview: "添付の地図に、噂の発生地点をまとめました。週末に合流できますか？",
        date: ago(52),
        bodyHtml: "<p>Kasen さん、</p><p>第3区画の調査が一段落しました。添付に発生地点マップと聞き込みメモを入れています。</p><p>週末、駅前で合流できますか？</p><p>— 環 いろは</p>",
        routing: { to: "contact@magireco.app", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m3", folder: "inbox", read: true, starred: false, hasAttachment: false,
        from: { name: "GitHub", email: "notifications@github.com" },
        routedFrom: "dev@magireco.app", routedVia: "cloudflare",
        subject: "[magireco/revival] CI passed on main (#482)",
        preview: "All checks have passed. Worker deploy preview is ready at revival-482.magireco.workers.dev",
        date: ago(95),
        bodyHtml: "<p>All checks have passed for <b>#482 — wire Email Sending binding</b>.</p><p>Preview: <a>revival-482.magireco.workers.dev</a></p>",
        routing: { to: "dev@magireco.app", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m4", folder: "inbox", read: true, starred: false, hasAttachment: false,
        from: { name: "やちよ", email: "yachiyo@mikazuki.villa" },
        routedFrom: "team@magireco.app", routedVia: "cloudflare",
        subject: "ミーティングは明日19時で",
        preview: "三日月荘で。フェリシアにも伝えておきます。",
        date: ago(180),
        bodyHtml: "<p>明日19時、三日月荘で。資料は持参します。</p><p>— やちよ</p>",
        routing: { to: "team@magireco.app", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m5", folder: "inbox", read: true, starred: true, hasAttachment: false,
        from: { name: "Stripe", email: "receipts@stripe.com" },
        routedFrom: "billing@magireco.app", routedVia: "cloudflare",
        subject: "Receipt from 魔法纪录复兴计划 — $20.00",
        preview: "Your monthly Workers Paid + Email Service subscription receipt is attached.",
        date: ago(60 * 20),
        bodyHtml: "<p>Thanks for your payment of <b>$20.00</b>.</p><p>Workers Paid · Email Service (public beta).</p>",
        routing: { to: "billing@magireco.app", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m6", folder: "inbox", read: true, starred: false, hasAttachment: false,
        from: { name: "アリナ", email: "alina@kamihama.art" },
        routedFrom: "hi@magireco.app", routedVia: "cloudflare",
        subject: "個展のDM、届いた？",
        preview: "ルームの新作、君にだけ先に見せたい。",
        date: ago(60 * 30),
        bodyHtml: "<p>個展のDMを routed で送ったけど、届いた？</p>",
        routing: { to: "hi@magireco.app", dkim: "pass", spf: "pass", dmarc: "fail" } },

      { id: "m7", folder: "inbox", read: true, starred: false, hasAttachment: false,
        from: { name: "Linear", email: "notifications@linear.app" },
        routedFrom: "dev@magireco.app", routedVia: "cloudflare",
        subject: "MR-128 assigned to you · Webmail auth screen",
        preview: "Status: In Progress · Due Fri · 'Cloudflare Access SSO button + session hydrate'",
        date: ago(60 * 44),
        bodyHtml: "<p><b>MR-128</b> — Webmail auth screen is assigned to you.</p>",
        routing: { to: "dev@magireco.app", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "s1", folder: "sent", read: true, starred: false, hasAttachment: false,
        from: { name: "调查员 Kasen", email: "kasen@magireco.app" },
        routedFrom: "kasen@magireco.app", routedVia: "cloudflare",
        subject: "Re: 神浜市調査レポート — 第3区画",
        preview: "ありがとう、週末いけます。駅前の噴水で10時に。",
        date: ago(40),
        bodyHtml: "<p>ありがとう、週末いけます。駅前の噴水で10時に。</p>",
        routing: { to: "iroha@kamihama.jp", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "d1", folder: "drafts", read: true, starred: false, hasAttachment: false,
        from: { name: "调查员 Kasen", email: "kasen@magireco.app" },
        routedFrom: "kasen@magireco.app", routedVia: "cloudflare",
        subject: "復興計画 月次まとめ（下書き）",
        preview: "今月のルーティング統計と、新しい destination の追加について…",
        date: ago(60 * 5),
        bodyHtml: "<p>今月のルーティング統計と、新しい destination の追加について…</p>",
        routing: { to: "", dkim: "—", spf: "—", dmarc: "—" } },

      { id: "sp1", folder: "spam", read: true, starred: false, hasAttachment: false,
        from: { name: "WINNER NOTICE", email: "claim@lucky-prize.win" },
        routedFrom: "hi@magireco.app", routedVia: "cloudflare",
        subject: "🎉 You have WON a Grief Seed!!!",
        preview: "Claim your prize now by clicking this definitely-safe link.",
        date: ago(60 * 10),
        bodyHtml: "<p>Definitely not a phishing attempt.</p>",
        routing: { to: "hi@magireco.app", dkim: "fail", spf: "fail", dmarc: "fail" } },
    ],
  };

  window.API = API;
  window.__MOCK = MOCK; // exposed for debugging only
})();
