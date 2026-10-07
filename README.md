# Tab Dedupe

Keeps **one Chrome tab per entity**. When a link opens something you already
have open in another tab (a PR review comment from Slack, a Sentry issue from an
alert, a Jira ticket, an Amplitude chart, a Claude artifact), the extension
navigates the *existing* tab to that URL, focuses it, and closes the
newly-opened tab. Different entities each keep their own tab.

## Sites and identities

| Site | URL shapes deduped | Identity |
|---|---|---|
| GitHub | `github.com/<owner>/<repo>/pull/<n>[/files…]` | `owner/repo/pull/n` |
| Amplitude | `app.amplitude.com/{analytics,experiment}/<org>/<type>/<id>` — chart, dashboard, notebook, cohort, experiment, flag, segment, user | `<type>/<id>` |
| Sentry | `<org>.sentry.io/issues/<id>`, `/organizations/<org>/issues/<id>`, `/dashboard/<id>`, `/alerts/rules/details/<id>` | `<host>/issue/<id>`, `<host>/dashboard/<id>`, `<host>/alert-rule/<id>` |
| Jira | `<org>.atlassian.net/browse/<KEY-123>`, `/jira/software/…/issues/<KEY-123>` | `<host>/issue/<KEY-123>` |
| Claude | `claude.ai/code/artifact/<id>` | `artifact/<id>` |

Anything not in the table is ignored — list views, search results, settings,
dashboards home, Claude chats and Claude Code sessions all open normally.

## Install (unpacked)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Done — no reload of the target tabs needed.

Coming from the old `chrome-ext-github-pr-tab-dedupe` folder: Chrome keys
unpacked extensions by path, so **remove the old entry and load unpacked
again**, otherwise Chrome shows it as missing.

## How it works

`background.js` listens to `chrome.tabs.onUpdated`. On any URL change, it
computes a site-namespaced identity (`SITES` table at the top of the file), looks
for another tab already showing that identity, and if found navigates that tab to
the new URL and removes the duplicate.

Adding a site = one entry in `SITES` (match pattern, hostname test, identity
extractor) plus the same pattern in `host_permissions`.

## Notes / gotchas

- **Identity ignores query string and hash — on purpose.** `/pull/123`,
  `/pull/123/files` and `/pull/123#discussion_r456` are one entity; so are a
  Sentry issue with and without `?project=`, and an Amplitude chart with
  different applied filters. That's what lets a deep link reuse the base tab.
  The flip side: opening the same chart twice to compare two filter sets is not
  possible while the extension is on.
- **Sentry numeric ids and short ids don't unify.** `/issues/7434233437` and
  `/issues/WEB-APP-7X0G` are the same issue for Sentry but different strings
  here, so they can coexist as two tabs. Resolving one to the other needs an API
  call — deliberately not done.
- **Sentry subroutes look like ids.** `/issues/alerts/rules/details/<id>` sits
  under `/issues/`; the issue regex only accepts digits or an UPPERCASE short id,
  which is what keeps `alerts` from being read as an issue id.
- **Jira `?selectedIssue=` is not deduped.** A board URL carrying a selected
  issue stays its own tab, so clicking a `/browse/KEY` link never navigates your
  board away.
- **Amplitude `new`/`create` ids are skipped.** Two unsaved charts share the
  literal id `new` and are not the same thing.
- **Not external-click aware.** It doesn't try to tell "opened from Slack" from
  "opened in-browser"; it simply never lets two tabs of the same entity coexist.
  In-tab navigation within one entity never triggers a close (no second tab
  exists).
- **`onUpdated`, not `webNavigation`.** Avoids the extra permission;
  `changeInfo.url` is enough to detect a tab landing on a URL.
- **Incognito and normal tabs never dedupe against each other.** Chrome keeps
  incognito tabs hidden from the extension unless you enable "Allow in
  incognito"; with it on, a link still only reuses a tab of the same kind.
- **Sentry and Jira identities include the org subdomain**, so the same issue
  number in two orgs stays two tabs.
- Host permissions are limited to the five sites above (Claude further narrowed
  to `/code/artifact/*`).

## Tests

`node test-identity.mjs` — runs `background.js` in a `vm` with a stubbed `chrome`
global and asserts `tabIdentity(url)` over 39 URLs (every site's shapes plus
the negative cases above). Add a case here when you add a site.
