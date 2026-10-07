// Tab Dedupe
//
// Goal: never keep two tabs open on the same *entity* — a PR, an Amplitude
// chart, a Sentry issue, a Jira ticket, a Claude artifact. When a tab navigates
// to an entity you already have open in another tab, we navigate the EXISTING
// tab to the new URL (so it lands on the clicked view / anchor), focus it, and
// close the tab that just opened. Different entities each keep their own tab.
//
// Identity is always derived from the *path* only: query string and hash are
// ignored on purpose, so a deep link (a PR review comment, a filtered chart)
// reuses the tab that already has the entity open.

// Sentry and Jira run on one subdomain per org, so their identities carry the
// hostname: issue 123 in two orgs is two entities.
//
// Each site: a URL match pattern (also used for the tabs.query filter), a host
// test, and an identity extractor returning null for anything that isn't a
// stable, addressable entity (list views, "new"/unsaved things, settings...).
const SITES = [
  {
    name: "github",
    pattern: "https://github.com/*",
    match: (u) => u.hostname === "github.com",
    // /<owner>/<repo>/pull/<number>[/files|/commits|...]
    identity: (u) => {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/);
      return m ? `${m[1]}/${m[2]}/pull/${m[3]}` : null;
    },
  },
  {
    name: "amplitude",
    pattern: "https://app.amplitude.com/*",
    match: (u) => u.hostname === "app.amplitude.com",
    // /analytics/<org>/chart/<id>[/edit/<id>], /analytics/<org>/dashboard/<id>,
    // /experiment/<org>/<type>/<id>, ...
    identity: (u) => {
      const m = u.pathname.match(
        /^\/(?:analytics|experiment)\/[^/]+\/(chart|dashboard|notebook|cohort|experiment|flag|segment|user)\/([\w-]+)(?:\/|$)/
      );
      if (!m) return null;
      const [, type, id] = m;
      // Unsaved things share the literal id "new" — they are not the same entity.
      if (id === "new" || id === "create") return null;
      return `${type}/${id}`;
    },
  },
  {
    name: "sentry",
    pattern: "https://*.sentry.io/*",
    match: (u) => u.hostname.endsWith(".sentry.io"),
    // Issues: /issues/<id>/... or /organizations/<org>/issues/<id>/...
    // <id> is numeric (7434233437) or a short id (WEB-APP-7X0G).
    // Dashboards: /dashboard/<id>
    // Alert rules: /alerts/rules/details/<id>/ (also nested under /issues/).
    identity: (u) => {
      const path = u.pathname.replace(/^\/organizations\/[^/]+/, "");
      const rule = path.match(/\/alerts\/rules\/details\/(\d+)(?:\/|$)/);
      if (rule) return `${u.hostname}/alert-rule/${rule[1]}`;
      const dashboard = path.match(/^\/dashboard\/([\d]+)(?:\/|$)/);
      if (dashboard) return `${u.hostname}/dashboard/${dashboard[1]}`;
      // Uppercase-only short ids keep lowercase subroutes (/issues/alerts/...)
      // from being mistaken for an issue id.
      const issue = path.match(
        /^\/issues\/(\d+|[A-Z0-9]+(?:-[A-Z0-9]+)+)(?:\/|$)/
      );
      return issue ? `${u.hostname}/issue/${issue[1]}` : null;
    },
  },
  {
    name: "jira",
    pattern: "https://*.atlassian.net/*",
    match: (u) => u.hostname.endsWith(".atlassian.net"),
    // /browse/PROJ-4232 and /jira/software/c/projects/PROJ/issues/PROJ-4232
    identity: (u) => {
      const m = u.pathname.match(
        /(?:^\/browse\/|\/issues\/)([A-Z][A-Z0-9_]+-\d+)(?:\/|$)/
      );
      return m ? `${u.hostname}/issue/${m[1]}` : null;
    },
  },
  {
    name: "claude-artifact",
    // Scoped to the artifact path so the extension never sees claude.ai chats.
    pattern: "https://claude.ai/code/artifact/*",
    match: (u) => u.hostname === "claude.ai",
    // /code/artifact/<id> — only artifacts, not Claude Code sessions or chats.
    identity: (u) => {
      const m = u.pathname.match(/^\/code\/artifact\/([\w-]+)(?:\/|$)/);
      return m ? `artifact/${m[1]}` : null;
    },
  },
];

const TAB_QUERY_PATTERNS = SITES.map((s) => s.pattern);

// Returns a stable identity string for a URL, namespaced by site, or null when
// the URL is not a dedupable entity.
function tabIdentity(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const site = SITES.find((s) => s.match(url));
  if (!site) return null;
  const identity = site.identity(url);
  return identity ? `${site.name}:${identity}` : null;
}

// Small lock so two rapid onUpdated events don't both try to dedupe the same
// pair (which could close both tabs).
const inFlight = new Set();

async function dedupe(changedTab, url) {
  const identity = tabIdentity(url);
  if (!identity || inFlight.has(identity)) return;
  inFlight.add(identity);
  try {
    const tabs = await chrome.tabs.query({ url: TAB_QUERY_PATTERNS });
    // Find an existing tab (not the one that just changed) showing the same
    // entity. Incognito and normal tabs never match each other, so a link never
    // crosses between the two profiles when the extension runs in incognito.
    const existing = tabs.find(
      (t) =>
        t.id !== changedTab.id &&
        t.incognito === changedTab.incognito &&
        tabIdentity(t.url) === identity
    );
    if (!existing) return; // First/only tab for this entity — leave it be.

    // Point the existing tab at the freshly-clicked URL, focus it, drop the dupe.
    await chrome.tabs.update(existing.id, { url, active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.remove(changedTab.id);
  } catch (e) {
    // Tab may have been closed mid-flight; ignore.
    console.debug("[tab-dedupe]", e);
  } finally {
    inFlight.delete(identity);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only react to actual URL changes (a navigation / new tab landing on a URL).
  if (changeInfo.url) dedupe(tab, changeInfo.url);
});
