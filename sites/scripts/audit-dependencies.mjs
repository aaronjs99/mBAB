import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const EXPIRES = Date.parse("2026-11-14T00:00:00Z");
const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const REVIEWED_CHAIN = new Set([
  "braces", "micromatch", "fast-glob", "@next/eslint-plugin-next",
  "eslint-config-next", "vite-plugin-dynamic-import", "vite-plugin-commonjs", "vinext",
]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function dependencyMap(value) {
  return value === undefined || (record(value) && Object.values(value).every((item) => typeof item === "string" && item.length > 0));
}

function validLockfile(lockfile) {
  if (!record(lockfile) || lockfile.lockfileVersion !== 3 || !record(lockfile.packages)
    || !Object.hasOwn(lockfile.packages, "") || !record(lockfile.packages[""])) return false;
  return Object.entries(lockfile.packages).every(([path, entry]) =>
    record(entry)
    && (path === "" || (typeof entry.version === "string" && entry.version.length > 0))
    && (entry.dev === undefined || typeof entry.dev === "boolean")
    && dependencyMap(entry.dependencies) && dependencyMap(entry.optionalDependencies)
    && dependencyMap(entry.devDependencies) && dependencyMap(entry.peerDependencies)
    && Object.keys(entry.dependencies ?? {}).every((dependency) => lockedDependency(lockfile.packages, path, dependency) !== undefined))
    && Object.keys(lockfile.packages[""].devDependencies ?? {}).every((dependency) => lockedDependency(lockfile.packages, "", dependency) !== undefined);
}

function validReport(report) {
  if (!record(report) || Object.hasOwn(report, "error") || report.auditReportVersion !== 2
    || !record(report.vulnerabilities) || !record(report.metadata)
    || !record(report.metadata.vulnerabilities)) return false;
  const totals = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const [name, entry] of Object.entries(report.vulnerabilities)) {
    if (!record(entry) || entry.name !== name || !SEVERITIES.includes(entry.severity)
      || typeof entry.isDirect !== "boolean" || typeof entry.range !== "string"
      || !strings(entry.nodes) || entry.nodes.length === 0 || !strings(entry.effects)
      || !Array.isArray(entry.via) || entry.via.length === 0) return false;
    for (const via of entry.via) {
      if (typeof via === "string" && via.length > 0) continue;
      if (!record(via) || !Number.isSafeInteger(via.source) || via.source <= 0
        || ![via.name, via.dependency, via.title, via.url, via.range].every((item) => typeof item === "string" && item.length > 0)
        || !SEVERITIES.includes(via.severity)
        || SEVERITIES.indexOf(via.severity) > SEVERITIES.indexOf(entry.severity)) return false;
    }
    totals[entry.severity]++;
  }
  const metadata = report.metadata.vulnerabilities;
  return SEVERITIES.every((severity) => Number.isSafeInteger(metadata[severity]) && metadata[severity] === totals[severity])
    && Number.isSafeInteger(metadata.total)
    && metadata.total === Object.keys(report.vulnerabilities).length;
}

function lockedDependency(packages, packagePath, dependency) {
  let parent = packagePath;
  while (true) {
    const candidate = `${parent ? `${parent}/` : ""}node_modules/${dependency}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    if (!parent) return undefined;
    const boundary = parent.lastIndexOf("/node_modules/");
    parent = boundary < 0 ? "" : parent.slice(0, boundary);
  }
}

function runtimeDependencies(packages) {
  const reached = new Set();
  const pending = [""];
  while (pending.length > 0) {
    const path = pending.pop();
    if (reached.has(path)) continue;
    reached.add(path);
    const entry = packages[path];
    for (const name of new Set([
      ...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {}),
      ...Object.keys(entry.peerDependencies ?? {}),
    ])) {
      const child = lockedDependency(packages, path, name);
      if (child !== undefined) pending.push(child);
    }
  }
  return reached;
}

/**
 * Assess npm's complete audit without hiding its unresolved finding.
 * The sole temporary acknowledgement is the reviewed development-tool chain;
 * new high/critical findings, runtime reachability, and unverifiable data fail.
 */
export function assessDependencyAudit({ report, lockfile, exitCode, transportError, now = new Date() } = {}) {
  const failures = [];
  const warnings = [];
  if (transportError || ![0, 1].includes(exitCode)) {
    return { ok: false, warnings, failures: ["npm audit did not complete successfully; registry, transport, or process failure."] };
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !validReport(report) || !validLockfile(lockfile)) {
    return { ok: false, warnings, failures: ["Malformed or unsupported audit, lockfile, or review date; the dependency audit cannot be verified."] };
  }
  if (exitCode === 1 && Object.keys(report.vulnerabilities).length === 0) {
    return { ok: false, warnings, failures: ["npm audit failed without a valid vulnerability explanation."] };
  }

  const { vulnerabilities } = report;
  const { packages } = lockfile;
  const root = packages[""];
  const runtime = runtimeDependencies(packages);
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    const direct = [root.dependencies, root.devDependencies, root.optionalDependencies, root.peerDependencies]
      .some((dependencies) => Object.hasOwn(dependencies ?? {}, name));
    if (entry.isDirect !== direct || entry.nodes.some((node) => !Object.hasOwn(packages, node)
      || !(node === `node_modules/${name}` || node.endsWith(`/node_modules/${name}`)))
      || entry.via.some((via) => typeof via === "string" && (!Object.hasOwn(vulnerabilities, via)
        || SEVERITIES.indexOf(vulnerabilities[via].severity) > SEVERITIES.indexOf(entry.severity)))) {
      return { ok: false, warnings, failures: ["Audit dependency paths, severities, or direct-dependency declarations disagree with the lockfile."] };
    }
  }
  function reviewed(name, trail = new Set()) {
    const entry = vulnerabilities[name];
    if (!REVIEWED_CHAIN.has(name) || !entry || entry.severity !== "high" || trail.has(name)) return false;
    const nextTrail = new Set(trail).add(name);
    if (entry.isDirect && (!Object.hasOwn(root.devDependencies ?? {}, name)
      || Object.hasOwn(root.dependencies ?? {}, name) || Object.hasOwn(root.optionalDependencies ?? {}, name))) return false;
    if (!entry.nodes.every((node) => {
      if (!node.startsWith("node_modules/") || node.includes("..") || node.includes("\\")) return false;
      const locked = packages[node];
      if (!locked || locked.dev !== true || runtime.has(node) || (name === "braces" && locked.version !== "3.0.3")) return false;
      return entry.via.every((via) => {
        if (typeof via !== "string") return true;
        if (!Object.hasOwn(locked.dependencies ?? {}, via)) return false;
        const child = lockedDependency(packages, node, via);
        return child !== undefined && vulnerabilities[via]?.nodes.includes(child);
      });
    })) return false;
    return entry.via.every((via) => typeof via === "string"
      ? reviewed(via, nextTrail)
      : name === "braces" && via.name === "braces" && via.dependency === "braces"
        && via.url === ADVISORY && via.severity === "high" && via.range === "<=3.0.3");
  }

  let acknowledged = 0;
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (!SEVERITIES.slice(3).includes(entry.severity)) continue;
    if (reviewed(name)) acknowledged++;
    else failures.push(`${name}: unacknowledged ${entry.severity} finding, runtime dependency, or unverified dependency chain.`);
  }
  if (acknowledged > 0) {
    warnings.push(`WARNING: GHSA-vfj7-8cjw-p6xm remains unpatched (${acknowledged} high-severity package findings in reviewed development tooling). Temporary acknowledgement through 2026-11-13 UTC. The vulnerability is not fixed. ${ADVISORY}`);
    if (now.getTime() >= EXPIRES) failures.push("The development-only braces acknowledgement expired after 2026-11-13 UTC. Review upstream fixes and runtime reachability before renewing it.");
  }
  return { ok: failures.length === 0, warnings, failures };
}

function main() {
  try {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run this check through npm run audit:dependencies so npm supplies its CLI path.");
    const result = spawnSync(process.execPath, [npmCli, "audit", "--json"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8", shell: false, timeout: 60_000, maxBuffer: 20 * 1024 * 1024,
    });
    // Preserve the complete unfiltered report in CI output, including the known
    // high finding. Policy changes its release decision, not the audit evidence.
    if (result.stdout) process.stdout.write(`${result.stdout.trim()}\n`);
    const policy = assessDependencyAudit({
      report: JSON.parse(result.stdout || "null"),
      lockfile: JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8")),
      exitCode: result.status,
      transportError: result.error ?? result.signal,
    });
    for (const warning of policy.warnings) console.warn(warning);
    for (const failure of policy.failures) console.error(`Dependency audit failed: ${failure}`);
    process.exitCode = policy.ok ? 0 : 1;
  } catch (error) {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
