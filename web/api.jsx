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
      name: "Alex Morgan",
      email: "alex@example.com",
      avatarColor: "230",
      primaryDomain: "example.com",
    },
    profile: {
      name: "Alex Morgan",
      email: "alex@example.com",
      timezone: "Asia/Shanghai",
      locale: "zh-CN",
      avatarColor: "230",
    },
    identities: [
      { id: "idn_1", name: "Alex Morgan",   email: "alex@example.com",    isDefault: true,  verified: true,
        signature: "— Alex" },
      { id: "idn_2", name: "Support",       email: "support@example.com", isDefault: false, verified: true,
        signature: "Support Team" },
      { id: "idn_3", name: "Notifications", email: "no-reply@example.com", isDefault: false, verified: false, signature: "" },
    ],
    destinations: [
      { id: "dst_1", email: "alex.personal@gmail.com", verified: true,  created: ago(60 * 24 * 40) },
      { id: "dst_2", email: "alex@proton.me",          verified: true,  created: ago(60 * 24 * 12) },
      { id: "dst_3", email: "archive@outlook.com",     verified: false, created: ago(60 * 6) },
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
        routedFrom: "hi@example.com", routedVia: "cloudflare",
        subject: "Your Email Routing is now sending too",
        preview: "Email Sending just hit public beta — reply to routed mail directly from your domain, no API keys.",
        date: ago(14),
        bodyHtml: "<p>Hi there,</p><p>Good news — <b>Email Sending</b> is now in public beta. Your domain <code>example.com</code> can now both receive (Email Routing) and send mail from a single Cloudflare service.</p><p>This webmail client is already wired for it: hit <b>Reply</b> on any routed message and it goes out authenticated with SPF + DKIM, configured automatically.</p><p>— The Cloudflare Email team</p>",
        routing: { to: "hi@example.com", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m2", folder: "inbox", read: false, starred: false, hasAttachment: true, attachmentCount: 2,
        from: { name: "Sarah Lee", email: "sarah@example.org" },
        routedFrom: "contact@example.com", routedVia: "cloudflare",
        subject: "Project sync — design notes",
        preview: "Attached the latest mockups and meeting notes. Can we sync this weekend?",
        date: ago(52),
        bodyHtml: "<p>Hi Alex,</p><p>Wrapped up the first pass on the redesign. I have attached the mockups and my notes from the review.</p><p>Are you free to sync sometime this weekend?</p><p>— Sarah</p>",
        routing: { to: "contact@example.com", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m3", folder: "inbox", read: true, starred: false, hasAttachment: false,
        from: { name: "GitHub", email: "notifications@github.com" },
        routedFrom: "dev@example.com", routedVia: "cloudflare",
        subject: "[your-org/webmail] CI passed on main (#482)",
        preview: "All checks have passed. The Worker deploy preview is ready.",
        date: ago(95),
        bodyHtml: "<p>All checks have passed for <b>#482 — wire Email Sending binding</b>.</p><p>Preview: <a>webmail-482.workers.dev</a></p>",
        routing: { to: "dev@example.com", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m4", folder: "inbox", read: true, starred: false, hasAttachment: false,
        from: { name: "David Kim", email: "david@example.net" },
        routedFrom: "team@example.com", routedVia: "cloudflare",
        subject: "Tomorrow's sync at 7pm",
        preview: "Same room as last time. I will bring the slides.",
        date: ago(180),
        bodyHtml: "<p>Let us meet at 7pm tomorrow, same room as last time. I will bring the slides.</p><p>— David</p>",
        routing: { to: "team@example.com", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m5", folder: "inbox", read: true, starred: true, hasAttachment: false,
        from: { name: "Stripe", email: "receipts@stripe.com" },
        routedFrom: "billing@example.com", routedVia: "cloudflare",
        subject: "Receipt — $20.00",
        preview: "Your monthly Workers Paid + Email Service subscription receipt.",
        date: ago(60 * 20),
        bodyHtml: "<p>Thanks for your payment of <b>$20.00</b>.</p><p>Workers Paid · Email Service (public beta).</p>",
        routing: { to: "billing@example.com", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "m6", folder: "inbox", read: true, starred: false, hasAttachment: false,
        from: { name: "Mia Chen", email: "mia@example.org" },
        routedFrom: "hi@example.com", routedVia: "cloudflare",
        subject: "Did you get my note?",
        preview: "Just making sure my last email reached you via the routed address.",
        date: ago(60 * 30),
        bodyHtml: "<p>Hey — just checking my last message actually reached you through the routed address?</p>",
        routing: { to: "hi@example.com", dkim: "pass", spf: "pass", dmarc: "fail" } },

      { id: "m7", folder: "inbox", read: true, starred: false, hasAttachment: false,
        from: { name: "Linear", email: "notifications@linear.app" },
        routedFrom: "dev@example.com", routedVia: "cloudflare",
        subject: "WEB-128 assigned to you · Auth screen",
        preview: "Status: In Progress · Due Fri · 'Cloudflare Access SSO button + session hydrate'",
        date: ago(60 * 44),
        bodyHtml: "<p><b>WEB-128</b> — Auth screen is assigned to you.</p>",
        routing: { to: "dev@example.com", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "s1", folder: "sent", read: true, starred: false, hasAttachment: false,
        from: { name: "Alex Morgan", email: "alex@example.com" },
        routedFrom: "alex@example.com", routedVia: "cloudflare",
        subject: "Re: Project sync — design notes",
        preview: "Thanks! This weekend works — let's say Saturday 10am.",
        date: ago(40),
        bodyHtml: "<p>Thanks Sarah! This weekend works — let us say Saturday 10am.</p>",
        routing: { to: "sarah@example.org", dkim: "pass", spf: "pass", dmarc: "pass" } },

      { id: "d1", folder: "drafts", read: true, starred: false, hasAttachment: false,
        from: { name: "Alex Morgan", email: "alex@example.com" },
        routedFrom: "alex@example.com", routedVia: "cloudflare",
        subject: "Monthly summary (draft)",
        preview: "This month's routing stats and the new destination addresses…",
        date: ago(60 * 5),
        bodyHtml: "<p>This month's routing stats and the new destination addresses…</p>",
        routing: { to: "", dkim: "—", spf: "—", dmarc: "—" } },

      { id: "sp1", folder: "spam", read: true, starred: false, hasAttachment: false,
        from: { name: "WINNER NOTICE", email: "claim@lucky-prize.win" },
        routedFrom: "hi@example.com", routedVia: "cloudflare",
        subject: "🎉 You have WON a prize!!!",
        preview: "Claim your prize now by clicking this definitely-safe link.",
        date: ago(60 * 10),
        bodyHtml: "<p>Definitely not a phishing attempt.</p>",
        routing: { to: "hi@example.com", dkim: "fail", spf: "fail", dmarc: "fail" } },
    ],
  };

  window.API = API;
  window.__MOCK = MOCK; // exposed for debugging only
})();
