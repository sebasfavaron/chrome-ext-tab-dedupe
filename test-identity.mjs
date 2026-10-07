import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./background.js", import.meta.url), "utf8");
const sandbox = {
  chrome: { tabs: { onUpdated: { addListener() {} } } },
  console,
  URL,
};
vm.createContext(sandbox);
new vm.Script(src + "\n;globalThis.__id = tabIdentity;").runInContext(sandbox);
const id = sandbox.__id;

const cases = [
  // [url, expected identity or null]
  ["https://github.com/acme/web-app/pull/9700", "github:acme/web-app/pull/9700"],
  ["https://github.com/acme/web-app/pull/9700/files#diff-abc", "github:acme/web-app/pull/9700"],
  ["https://github.com/acme/web-app/pull/9700#discussion_r456", "github:acme/web-app/pull/9700"],
  ["https://github.com/acme/web-app/pull/9701", "github:acme/web-app/pull/9701"],
  ["https://github.com/acme/web-app/pulls", null],
  ["https://github.com/acme/web-app/issues/12", null],

  ["https://app.amplitude.com/analytics/acme/chart/00vs4s3j", "amplitude:chart/00vs4s3j"],
  ["https://app.amplitude.com/analytics/acme/chart/00vs4s3j?source=slack", "amplitude:chart/00vs4s3j"],
  ["https://app.amplitude.com/analytics/acme/chart/uflzy5q5/edit/5ey1ascx", "amplitude:chart/uflzy5q5"],
  ["https://app.amplitude.com/analytics/acme/dashboard/4mvnokqt", "amplitude:dashboard/4mvnokqt"],
  ["https://app.amplitude.com/analytics/acme/chart/new", null],
  ["https://app.amplitude.com/analytics/acme/activity", null],
  ["https://app.amplitude.com/", null],

  ["https://acme.sentry.io/issues/7434233437/", "sentry:acme.sentry.io/issue/7434233437"],
  ["https://other.sentry.io/issues/7434233437/", "sentry:other.sentry.io/issue/7434233437"],
  ["https://acme.sentry.io/issues/7434233437/events/latest/?project=123", "sentry:acme.sentry.io/issue/7434233437"],
  ["https://acme.sentry.io/issues/WEB-APP-7X0G/", "sentry:acme.sentry.io/issue/WEB-APP-7X0G"],
  ["https://acme.sentry.io/organizations/acme/issues/7434233437/", "sentry:acme.sentry.io/issue/7434233437"],
  ["https://acme.sentry.io/dashboard/545004", "sentry:acme.sentry.io/dashboard/545004"],
  ["https://acme.sentry.io/dashboard/545004/?environment=production&project=5944760&statsPeriod=24h", "sentry:acme.sentry.io/dashboard/545004"],
  ["https://acme.sentry.io/issues/alerts/rules/details/412524/", "sentry:acme.sentry.io/alert-rule/412524"],
  ["https://acme.sentry.io/alerts/rules/details/412524/", "sentry:acme.sentry.io/alert-rule/412524"],
  ["https://acme.sentry.io/issues/", null],
  ["https://acme.sentry.io/issues/?query=is:unresolved", null],
  ["https://acme.sentry.io/explore/discover/homepage/", null],
  ["https://acme.sentry.io/settings/audit-log/", null],

  ["https://acme.atlassian.net/browse/PROJ-4232", "jira:acme.atlassian.net/issue/PROJ-4232"],
  ["https://other.atlassian.net/browse/PROJ-4232", "jira:other.atlassian.net/issue/PROJ-4232"],
  ["https://acme.atlassian.net/browse/PROJ-4232?focusedCommentId=1", "jira:acme.atlassian.net/issue/PROJ-4232"],
  ["https://acme.atlassian.net/jira/software/c/projects/PROJ/issues/PROJ-4232", "jira:acme.atlassian.net/issue/PROJ-4232"],
  ["https://acme.atlassian.net/jira/software/c/projects/PROJ/boards/123?selectedIssue=PROJ-4232", null],
  ["https://acme.atlassian.net/browse/", null],

  ["https://claude.ai/code/artifact/abc123", "claude-artifact:artifact/abc123"],
  ["https://claude.ai/code/artifact/abc123?v=2", "claude-artifact:artifact/abc123"],
  ["https://claude.ai/code/session/xyz", null],
  ["https://claude.ai/chat/abc", null],

  ["https://example.com/pull/1", null],
  ["chrome://extensions", null],
  ["not a url", null],
];

let fail = 0;
for (const [url, expected] of cases) {
  const got = id(url);
  const ok = got === expected;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${url}\n        got=${got} expected=${expected}`);
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
process.exit(fail ? 1 : 0);
