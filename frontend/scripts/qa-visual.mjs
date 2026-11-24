#!/usr/bin/env node
/**
 * Visual / responsive / accessibility QA against a LOCAL dev stack (never a deployed site).
 *
 *   QA_EMAIL=... QA_PASSWORD=... node scripts/qa-visual.mjs [--shots dir] [--quick]
 *
 * Uses the locally installed Google Chrome through playwright-core (no browser download) and axe-core.
 * For every route x viewport x theme x direction it records: horizontal overflow, axe violations (WCAG 2.0/2.1/2.2
 * A+AA rules), elements with a pure-white (#FFFFFF) background, and console errors. A normal (non-admin) user is
 * registered on the local QA database to verify that /admin is refused. Output: <shots>/qa-report.json.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const WEB = process.env.QA_WEB ?? "http://localhost:3000";
const API = process.env.QA_API ?? "http://localhost:8000";
for (const u of [WEB, API]) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) throw new Error(`refusing non-local target ${u}`);
}
const args = process.argv.slice(2);
const SHOTS = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : "qa-shots";
const QUICK = args.includes("--quick");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const USER_ROUTES = ["/dashboard", "/achievements", "/cv", "/studio", "/jobs", "/tailor", "/gap", "/settings"];
const PUBLIC_ROUTES = ["/", "/login", "/register"];
const ADMIN_ROUTES = ["/admin/monitoring"];
const ONLY_W = process.env.QA_WIDTHS ? process.env.QA_WIDTHS.split(",").map(Number) : null;
const VIEWPORTS = ONLY_W ? ONLY_W.map((w) => [w, w <= 400 ? 844 : 900]) : QUICK ? [[1440, 900], [390, 844]] : [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844], [320, 640]];
// full matrix for automated checks; screenshots only for the combinations listed here
const SHOT_SET = new Set(["1440:light:en", "390:light:en", "1440:dark:en", "390:light:ar", "1440:light:ar", "390:dark:ar", "768:light:en"]);

async function token(email, password) {
  const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  return (await r.json()).access_token;
}

async function normalUserToken() {
  const email = `qa-normal-${Date.now()}@example.com`;
  const password = `qa-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const r = await fetch(`${API}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, full_name: "QA Normal User" }) });
  if (!r.ok) throw new Error(`register failed ${r.status}`);
  return (await r.json()).access_token;
}

const slug = (route) => (route === "/" ? "landing" : route.replace(/^\//, "").replace(/\//g, "-"));

async function inspect(page) {
  return page.evaluate(async (axeSrc) => {
    if (!window.axe) (0, eval)(axeSrc);
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const white = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.backgroundColor !== "rgb(255, 255, 255)" || cs.visibility === "hidden" || cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 64) continue;
      white.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), w: Math.round(r.width), h: Math.round(r.height) });
    }
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
    const violations = res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) }));
    return { overflow, white: white.slice(0, 10), whiteCount: white.length, bodyBg, violations };
  }, AXE);
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const userTok = await token(process.env.QA_EMAIL, process.env.QA_PASSWORD);
  const normalTok = await normalUserToken();
  const results = [];

  for (const [w, h] of VIEWPORTS) {
    for (const theme of ["light", "dark"]) {
      for (const locale of ["en", "ar"]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: w <= 400 ? 2 : 1 });
        await ctx.addInitScript(([t, l]) => {
          localStorage.setItem("wasl.theme", t);
          localStorage.setItem("wasl.locale", l);
        }, [theme, locale]);
        const page = await ctx.newPage();
        const errors = [];
        page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
        const visit = async (route, kind) => {
          errors.length = 0;
          await page.goto(WEB + route, { waitUntil: "load", timeout: 45000 }).catch(() => {});
          // wait until data has loaded: no skeletons / spinners left (bounded)
          await page.waitForFunction(() => !document.querySelector(".skeleton, [role=status] .animate-spin, .animate-spin"), null, { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(350);
          const info = await inspect(page);
          const key = `${w}:${theme}:${locale}`;
          let shot = null;
          if (SHOT_SET.has(key)) {
            shot = path.join(SHOTS, `${slug(route)}--${w}-${theme}-${locale}.png`);
            await page.screenshot({ path: shot, fullPage: w <= 400 ? false : true });
          }
          results.push({ route, kind, viewport: w, theme, locale, finalUrl: page.url().replace(WEB, ""), ...info, consoleErrors: [...errors], shot });
        };
        for (const r of PUBLIC_ROUTES) await visit(r, "public");
        await page.evaluate((t) => localStorage.setItem("wasl.token", t), userTok);
        for (const r of USER_ROUTES) await visit(r, "user");
        // admin console (cookie issued by the app's own gate endpoint after the backend confirms the role)
        await page.request.post(`${WEB}/api/admin-session`, { data: { token: userTok }, headers: { origin: WEB } });
        for (const r of ADMIN_ROUTES) await visit(r, "admin");
        await ctx.close();
      }
    }
    if (QUICK) break;
  }

  // a normal user must be refused by the server before the admin console renders
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem("wasl.token", t), normalTok);
  const gate = await page.request.post(`${WEB}/api/admin-session`, { data: { token: normalTok }, headers: { origin: WEB } });
  await page.goto(`${WEB}/admin/monitoring`, { waitUntil: "load" });
  await page.waitForTimeout(1000);
  const isolation = {
    gate_status: gate.status(),
    final_url: page.url().replace(WEB, ""),
    admin_api_status: (await page.request.get(`${API}/api/admin/monitoring/metrics`, { headers: { authorization: `Bearer ${normalTok}` } })).status(),
    legacy_api_status: (await page.request.get(`${API}/api/monitoring/metrics?scope=all`, { headers: { authorization: `Bearer ${normalTok}` } })).status(),
    anonymous_api_status: (await page.request.get(`${API}/api/admin/health`)).status(),
  };
  await ctx.close();
  await browser.close();

  const summary = {
    at: new Date().toISOString(),
    checks: results.length,
    overflow_failures: results.filter((r) => r.overflow > 1).map((r) => `${r.route} ${r.viewport} ${r.theme} ${r.locale} +${r.overflow}px`),
    pure_white_pages: results.filter((r) => r.whiteCount > 0).map((r) => `${r.route} ${r.viewport} ${r.theme} ${r.locale}: ${r.whiteCount} (${r.white.map((x) => x.tag + "." + x.cls.split(" ")[0]).slice(0, 3).join(", ")})`),
    axe_by_rule: Object.entries(results.flatMap((r) => r.violations.map((v) => `${v.id} [${v.impact}]`)).reduce((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {})),
    console_error_pages: results.filter((r) => r.consoleErrors.length).map((r) => `${r.route} ${r.viewport} ${r.theme} ${r.locale}: ${r.consoleErrors[0]}`).slice(0, 20),
    redirected: results.filter((r) => r.finalUrl.split("?")[0] !== r.route).map((r) => `${r.route} -> ${r.finalUrl}`).slice(0, 10),
    admin_isolation_for_normal_user: isolation,
  };
  fs.writeFileSync(path.join(SHOTS, "qa-report.json"), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
