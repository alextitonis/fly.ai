/**
 * 5H1T Analytics Reports.
 *
 * Pulls analytics from GA4, Microsoft Clarity, Cloudflare, PostHog, and Base Dashboard.
 * All credentials are loaded from environment variables (e.g. ~/.config/analytics/credentials.env).
 *
 * Usage:
 *   node scripts/analytics.ts ga4 daily 30
 *   node scripts/analytics.ts ga4 top-content 30
 *   node scripts/analytics.ts clarity 3 Device
 *   node scripts/analytics.ts clarity 3 URL Device "Country/Region"
 *   node scripts/analytics.ts cloudflare 7
 *   node scripts/analytics.ts cloudflare 7 country
 *   node scripts/analytics.ts posthog events 50
 *   node scripts/analytics.ts posthog trends
 *   node scripts/analytics.ts base users
 *   node scripts/analytics.ts base notify "Title" "Body" "/#/impact"
 */

// ─── GA4 ─────────────────────────────────────────────────────────────────────

async function ga4Report(reportName: string, daysAgo: string): Promise<void> {
  const { BetaAnalyticsDataClient } = await import("@google-analytics/data");
  const propertyId = process.env.GA4_PROPERTY_ID ?? "551162789";
  const client = new BetaAnalyticsDataClient();

  const reports: Record<string, { dimensions: { name: string }[]; metrics: { name: string }[]; label: string }> = {
    daily: {
      label: "Daily acquisition by channel",
      dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "newUsers" }],
    },
    "top-content": {
      label: "Top content",
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "sessions" }, { name: "averageSessionDuration" }],
    },
    events: {
      label: "Events / conversions",
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "keyEvents" }, { name: "totalUsers" }],
    },
    geography: {
      label: "Geography",
      dimensions: [{ name: "country" }, { name: "city" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }],
    },
    device: {
      label: "Device category",
      dimensions: [{ name: "deviceCategory" }, { name: "operatingSystem" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagedSessions" }, { name: "averageSessionDuration" }],
    },
    "landing-pages": {
      label: "Landing pages (entry points)",
      dimensions: [{ name: "landingPagePlusQueryString" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "averageSessionDuration" }, { name: "screenPageViewsPerSession" }],
    },
    engagement: {
      label: "Engagement overview",
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "engagementRate" }, { name: "averageSessionDuration" }, { name: "screenPageViewsPerSession" }, { name: "eventCount" }],
    },
    tech: {
      label: "Browser / tech",
      dimensions: [{ name: "browser" }, { name: "deviceCategory" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "averageSessionDuration" }],
    },
    hourly: {
      label: "Traffic by day-of-week + hour",
      dimensions: [{ name: "dayOfWeek" }, { name: "hour" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    },
    "new-vs-returning": {
      label: "New vs returning users",
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagedSessions" }, { name: "averageSessionDuration" }],
    },
  };

  const config = reports[reportName];
  if (!config) {
    console.error(`Unknown GA4 report: "${reportName}". Available: ${Object.keys(reports).join(", ")}`);
    process.exit(1);
  }

  const days = Number(daysAgo ?? "30");
  console.log(`\n=== ${config.label} (last ${days} days) ===\n`);
  console.log(`Property ID: ${propertyId}`);

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: config.dimensions,
    metrics: config.metrics,
    orderBys: (reportName === "daily" || reportName === "engagement")
      ? [{ dimension: { dimensionName: "date", orderType: "NUMERIC" } }]
      : reportName === "hourly"
        ? [{ dimension: { dimensionName: "dayOfWeek", orderType: "NUMERIC" } }, { dimension: { dimensionName: "hour", orderType: "NUMERIC" } }]
        : [{ metric: { metricName: config.metrics[0].name }, desc: true }],
    limit: (reportName === "daily" || reportName === "engagement" || reportName === "hourly") ? 1000 : 100,
  });

  if (!response.rows || response.rows.length === 0) {
    console.log("No data returned.");
    return;
  }

  for (const row of response.rows) {
    const dims = row.dimensionValues?.map((v) => v.value ?? "") ?? [];
    const metrics = row.metricValues?.map((v) => v.value ?? "") ?? [];
    const entry: Record<string, string> = {};
    config.dimensions.forEach((d, i) => { entry[d.name] = dims[i]; });
    config.metrics.forEach((m, i) => { entry[m.name] = metrics[i]; });
    console.log(entry);
  }
}

// ─── Clarity ─────────────────────────────────────────────────────────────────

async function clarityReport(numOfDays: string, ...dimArgs: string[]): Promise<void> {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) { console.error("CLARITY_API_TOKEN not set"); process.exit(1); }

  const days = Number(numOfDays ?? "3");
  if (![1, 2, 3].includes(days)) { console.error(`numOfDays must be 1, 2, or 3`); process.exit(1); }

  const validDims = ["Browser", "Device", "Country/Region", "OS", "Source", "Medium", "Campaign", "Channel", "URL"];
  const dimensions: string[] = [];
  for (const d of dimArgs.slice(0, 3)) {
    if (!validDims.includes(d)) { console.error(`Invalid dimension: "${d}". Valid: ${validDims.join(", ")}`); process.exit(1); }
    dimensions.push(d);
  }

  const params = new URLSearchParams();
  params.set("numOfDays", String(days));
  dimensions.forEach((d, i) => params.set(`dimension${i + 1}`, d));

  console.log(`\nClarity Data Export — last ${days} day(s)${dimensions.length ? `, dims: ${dimensions.join(", ")}` : ""}`);
  const res = await fetch(`https://www.clarity.ms/export-data/api/v1/project-live-insights?${params}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Clarity API ${res.status}: ${await res.text()}`);
  const data = await res.json() as Array<{ metricName: string; information: Array<Record<string, unknown>> }>;
  if (Array.isArray(data)) {
    for (const entry of data) {
      console.log(`\n--- ${entry.metricName} ---`);
      for (const row of entry.information ?? []) console.log(`  ${JSON.stringify(row)}`);
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

// ─── Cloudflare ──────────────────────────────────────────────────────────────

async function cloudflareReport(daysAgo: string, groupBy: string): Promise<void> {
  const email = process.env.CLOUDFLARE_EMAIL;
  const key = process.env.CLOUDFLARE_API_KEY;
  if (!email || !key) { console.error("CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY not set"); process.exit(1); }

  const domain = process.env.CLOUDFLARE_DOMAIN ?? "shit.finance";
  const days = Number(daysAgo || "7");
  const since = new Date(); since.setDate(since.getDate() - days);
  const until = new Date();
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = until.toISOString().split("T")[0];

  const headers = { "X-Auth-Email": email, "X-Auth-Key": key, "Content-Type": "application/json" };

  const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${domain}`, { headers });
  const zoneData = await zoneRes.json() as { success: boolean; result: Array<{ id: string }> };
  if (!zoneData.success || !zoneData.result?.length) throw new Error(`No zone found for ${domain}`);
  const zoneId = zoneData.result[0].id;
  console.log(`Domain: ${domain} | Zone: ${zoneId} | Range: ${sinceStr} to ${untilStr}`);

  if (groupBy === "country" || groupBy === "status") {
    const dimField = groupBy === "country" ? "clientCountryName" : "edgeResponseStatus";
    const allRows: Array<Record<string, unknown>> = [];
    for (let d = new Date(sinceStr); d < until; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split("T")[0];
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const nextStr = next.toISOString().split("T")[0];
      const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST", headers,
        body: JSON.stringify({ query: `{ viewer { zones(filter: { zoneTag: "${zoneId}" }) { httpRequestsAdaptiveGroups(limit: 1000, filter: { date_geq: "${dayStr}", date_lt: "${nextStr}" }, orderBy: [${dimField}_ASC]) { count dimensions { ${dimField} } } } } }` }),
      });
      const data = await res.json() as { data?: { viewer?: { zones?: Array<{ httpRequestsAdaptiveGroups?: Array<Record<string, unknown>> }> } } };
      allRows.push(...(data.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? []));
    }
    console.log(`\n=== Cloudflare Analytics by ${groupBy} ===\n`);
    const aggregated = new Map<string, number>();
    for (const row of allRows) {
      const dims = row.dimensions as Record<string, unknown>;
      const k = String(dims[dimField] ?? "unknown");
      aggregated.set(k, (aggregated.get(k) ?? 0) + ((row.count as number) ?? 0));
    }
    for (const [k, v] of [...aggregated.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(30)} requests=${v}`);
    }
  } else {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers,
      body: JSON.stringify({ query: `{ viewer { zones(filter: { zoneTag: "${zoneId}" }) { httpRequests1dGroups(limit: 1000, filter: { date_geq: "${sinceStr}", date_lt: "${untilStr}" }, orderBy: [date_ASC]) { dimensions { date } sum { pageViews requests cachedRequests bytes threats encryptedRequests } uniq { uniques } } } } }` }),
    });
    const data = await res.json() as { data?: { viewer?: { zones?: Array<{ httpRequests1dGroups?: Array<Record<string, unknown>> }> } } };
    const rows = data.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
    console.log(`\n=== Cloudflare Zone Analytics Overview ===\n`);
    let totalViews = 0, totalReq = 0, totalUniques = 0;
    for (const row of rows) {
      const sum = row.sum as Record<string, number>; const uniq = row.uniq as Record<string, number>;
      totalViews += sum.pageViews ?? 0; totalReq += sum.requests ?? 0; totalUniques += uniq.uniques ?? 0;
    }
    console.log(`  Page Views: ${totalViews}  Requests: ${totalReq}  Uniques: ${totalUniques}`);
    for (const row of rows) {
      const dims = row.dimensions as Record<string, string>; const sum = row.sum as Record<string, number>;
      console.log(`  ${dims.date}  views=${sum.pageViews}  req=${sum.requests}`);
    }
  }
}

// ─── PostHog ─────────────────────────────────────────────────────────────────

async function posthogReport(command: string, arg: string): Promise<void> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) { console.error("POSTHOG_PERSONAL_API_KEY not set"); process.exit(1); }
  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  const projectId = process.env.POSTHOG_PROJECT_ID ?? "573593";

  async function runHogQL(query: string): Promise<{ results: unknown[][]; columns: string[] }> {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    if (!res.ok) throw new Error(`PostHog API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  function printTable(data: { results: unknown[][]; columns: string[] }) {
    if (data.columns) { console.log(data.columns.join("  |  ")); console.log("-".repeat(80)); }
    for (const row of data.results ?? []) console.log(row.map((v) => String(v ?? "")).join("  |  "));
  }

  switch (command) {
    case "events": {
      console.log(`\n=== Last ${arg ?? "30"} Events ===\n`);
      printTable(await runHogQL(`SELECT event, timestamp, distinct_id, properties.$pathname as path FROM events WHERE timestamp > now() - interval 7 day ORDER BY timestamp DESC LIMIT ${arg ?? "30"}`));
      break;
    }
    case "query": case "sql": {
      if (!arg) { console.error('Usage: posthog query "SELECT ..."'); process.exit(1); }
      printTable(await runHogQL(arg));
      break;
    }
    case "trends": {
      console.log(`\n=== Pageview Trends (7d) ===\n`);
      printTable(await runHogQL(`SELECT toDate(timestamp) as date, count() as pageviews, countDistinct(distinct_id) as unique_users FROM events WHERE event = '$pageview' AND timestamp > now() - interval 7 day GROUP BY date ORDER BY date ASC`));
      break;
    }
    case "funnels": {
      console.log(`\n=== Wallet Connect Funnel (7d) ===\n`);
      printTable(await runHogQL(`SELECT event, count() as count, countDistinct(distinct_id) as unique_users FROM events WHERE event IN ('$pageview','wallet_connected','wallet_disconnected') AND timestamp > now() - interval 7 day GROUP BY event ORDER BY count DESC`));
      break;
    }
    case "sessions": {
      const res = await fetch(`${host}/api/projects/${projectId}/session_recordings/?limit=20&order=start_time`, { headers: { Authorization: `Bearer ${key}` } });
      const data = await res.json() as { results: Array<Record<string, unknown>> };
      for (const s of data.results ?? []) console.log(`  ${s.start_time ?? "?"}  duration=${s.duration ?? "?"}s  user=${s.distinct_id ?? "?"}`);
      break;
    }
    case "breakdown": {
      console.log(`\n=== Event Breakdown (7d) ===\n`);
      printTable(await runHogQL(`SELECT event, count() as count, countDistinct(distinct_id) as unique_users FROM events WHERE timestamp > now() - interval 7 day GROUP BY event ORDER BY count DESC LIMIT 50`));
      break;
    }
    default:
      console.error(`Unknown posthog command: ${command}. Available: events, query, trends, funnels, sessions, breakdown`);
      process.exit(1);
  }
}

// ─── Base Developer Platform ─────────────────────────────────────────────────

async function baseReport(command: string, ...args: string[]): Promise<void> {
  const apiKey = process.env.BASE_DEV_API_KEY;
  if (!apiKey) { console.error("BASE_DEV_API_KEY not set"); process.exit(1); }
  const appUrl = process.env.BASE_APP_URL ?? "https://shit.finance";
  const dashboardUrl = "https://dashboard.base.org/api/v1";
  const apiBaseUrl = "https://api.base.dev/v1";
  const headers = { "x-api-key": apiKey, "Content-Type": "application/json" };

  switch (command) {
    case "users": case "all-users": {
      const params = new URLSearchParams({ app_url: appUrl });
      if (command === "users") params.set("notification_enabled", "true");
      const res = await fetch(`${dashboardUrl}/notifications/app/users?${params}`, { headers });
      if (!res.ok) throw new Error(`Base API ${res.status}: ${await res.text()}`);
      const data = await res.json() as { users?: Array<{ wallet_address: string; notification_enabled: boolean }>; count?: number };
      console.log(`\nTotal users: ${data.count ?? data.users?.length ?? 0}\n`);
      for (const u of data.users ?? []) console.log(`  ${u.wallet_address}  notifications=${u.notification_enabled ? "ON" : "OFF"}`);
      break;
    }
    case "notify": {
      const [title, message, targetPath] = args;
      if (!title || !message) { console.error('Usage: base notify "Title" "Body" "/#/path"'); process.exit(1); }
      const usersRes = await fetch(`${dashboardUrl}/notifications/app/users?app_url=${appUrl}&notification_enabled=true`, { headers });
      const usersData = await usersRes.json() as { users?: Array<{ wallet_address: string }> };
      const addresses = usersData.users?.map((u) => u.wallet_address) ?? [];
      if (!addresses.length) { console.log("No users with notifications enabled."); break; }
      const res = await fetch(`${dashboardUrl}/notifications/send`, {
        method: "POST", headers,
        body: JSON.stringify({ app_url: appUrl, wallet_addresses: addresses, title, message, target_path: targetPath ?? "/" }),
      });
      console.log(`Sent to ${addresses.length} user(s): ${JSON.stringify(await res.json())}`);
      break;
    }
    case "builder-code": {
      const [wallet] = args;
      if (!wallet) { console.error("Usage: base builder-code 0x..."); process.exit(1); }
      const res = await fetch(`${apiBaseUrl}/agents/builder-codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletAddress: wallet }) });
      const data = await res.json() as { builderCode: string; walletAddress: string };
      console.log(`Builder Code: ${data.builderCode}  Wallet: ${data.walletAddress}`);
      break;
    }
    case "app-info": {
      const res = await fetch(`${dashboardUrl}/apps?app_url=${appUrl}`, { headers });
      console.log(JSON.stringify(await res.json(), null, 2));
      break;
    }
    default:
      console.error(`Unknown base command: ${command}. Available: users, all-users, notify, builder-code, app-info`);
      process.exit(1);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const [source, ...args] = process.argv.slice(2);

  switch (source) {
    case "ga4": await ga4Report(args[0] ?? "daily", args[1] ?? "30"); break;
    case "clarity": await clarityReport(args[0] ?? "3", ...args.slice(1)); break;
    case "cloudflare": await cloudflareReport(args[0] ?? "7", args[1] ?? ""); break;
    case "posthog": await posthogReport(args[0] ?? "events", args[1]); break;
    case "base": await baseReport(args[0] ?? "users", ...args.slice(1)); break;
    default:
      console.error("5H1T Analytics Reports");
      console.error("");
      console.error("Usage: node scripts/analytics.ts <source> [args...]");
      console.error("");
      console.error("Sources:");
      console.error("  ga4 <report> [days]        daily, top-content, events, geography, device, landing-pages, engagement, tech, hourly, new-vs-returning");
      console.error("  clarity [days] [dim1 dim2 dim3]  Browser, Device, Country/Region, OS, Source, Medium, Campaign, Channel, URL");
      console.error("  cloudflare [days] [country|status]");
      console.error("  posthog <events|query|trends|funnels|sessions|breakdown> [arg]");
      console.error("  base <users|all-users|notify|builder-code|app-info> [args...]");
      process.exit(1);
  }
}

main().catch((err) => { console.error("Analytics error:", err); process.exit(1); });
