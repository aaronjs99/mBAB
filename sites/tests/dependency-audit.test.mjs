import assert from "node:assert/strict";
import { test } from "node:test";
import { assessDependencyAudit } from "../scripts/audit-dependencies.mjs";

const advisoryUrl = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const now = new Date("2026-10-13T20:00:00Z");

function vulnerability(name, via, nodes = [`node_modules/${name}`], isDirect = false) {
  return { name, severity: "high", isDirect, via, effects: [], range: "*", nodes, fixAvailable: false };
}

function fixture() {
  return {
    now,
    exitCode: 1,
    report: {
      auditReportVersion: 2,
      vulnerabilities: {
        braces: vulnerability("braces", [{
          source: 1240992, name: "braces", dependency: "braces",
          title: "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns",
          url: advisoryUrl, severity: "high", range: "<=3.0.3",
        }]),
        micromatch: vulnerability("micromatch", ["braces"]),
        "fast-glob": vulnerability("fast-glob", ["micromatch"], [
          "node_modules/fast-glob",
          "node_modules/vite-plugin-dynamic-import/node_modules/fast-glob",
        ]),
        "@next/eslint-plugin-next": vulnerability("@next/eslint-plugin-next", ["fast-glob"]),
        "eslint-config-next": vulnerability("eslint-config-next", ["@next/eslint-plugin-next"], undefined, true),
        "vite-plugin-dynamic-import": vulnerability("vite-plugin-dynamic-import", ["fast-glob"]),
        "vite-plugin-commonjs": vulnerability("vite-plugin-commonjs", ["vite-plugin-dynamic-import"]),
        vinext: vulnerability("vinext", ["vite-plugin-commonjs"], undefined, true),
      },
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 8, critical: 0, total: 8 } },
    },
    lockfile: {
      lockfileVersion: 3,
      packages: {
        "": { name: "mbab-sites", version: "0.1.0", dependencies: { react: "19.2.8" }, devDependencies: { vinext: "1.1.0", "eslint-config-next": "16.4.0" } },
        "node_modules/react": { version: "19.2.8" },
        "node_modules/braces": { version: "3.0.3", dev: true },
        "node_modules/micromatch": { version: "4.0.8", dev: true, dependencies: { braces: "^3.0.3" } },
        "node_modules/fast-glob": { version: "3.3.1", dev: true, dependencies: { micromatch: "^4.0.4" } },
        "node_modules/vite-plugin-dynamic-import/node_modules/fast-glob": { version: "3.3.3", dev: true, dependencies: { micromatch: "^4.0.8" } },
        "node_modules/@next/eslint-plugin-next": { version: "16.4.0", dev: true, dependencies: { "fast-glob": "3.3.1" } },
        "node_modules/eslint-config-next": { version: "16.4.0", dev: true, dependencies: { "@next/eslint-plugin-next": "16.4.0" } },
        "node_modules/vite-plugin-dynamic-import": { version: "1.6.0", dev: true, dependencies: { "fast-glob": "^3.3.2" } },
        "node_modules/vite-plugin-commonjs": { version: "0.10.4", dev: true, dependencies: { "vite-plugin-dynamic-import": "^1.6.0" } },
        "node_modules/vinext": { version: "1.1.0", dev: true, dependencies: { "vite-plugin-commonjs": "^0.10.4" } },
      },
    },
  };
}

test("the reviewed development-only braces chain remains visible as an unpatched warning", () => {
  const result = assessDependencyAudit(fixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /GHSA-vfj7-8cjw-p6xm/);
  assert.match(result.warnings[0], /2026-11-13/);
  assert.match(result.warnings[0], /unpatched|not fixed/i);
});

test("an unknown high advisory fails even inside the same braces package", () => {
  const input = fixture();
  input.report.vulnerabilities.braces.via.push({
    source: 999, name: "braces", dependency: "braces", title: "Another problem",
    url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz", severity: "high", range: "*",
  });
  assert.equal(assessDependencyAudit(input).ok, false);
});

test("critical severity is never covered by the high-severity acknowledgement", () => {
  const input = fixture();
  input.report.vulnerabilities.braces.severity = "critical";
  input.report.vulnerabilities.braces.via[0].severity = "critical";
  input.report.metadata.vulnerabilities.high = 7;
  input.report.metadata.vulnerabilities.critical = 1;
  assert.equal(assessDependencyAudit(input).ok, false);
});

test("every affected lockfile path must be development-only", () => {
  for (const path of ["node_modules/braces", "node_modules/vinext", "node_modules/vite-plugin-dynamic-import/node_modules/fast-glob"]) {
    for (const dev of [false, undefined]) {
      const input = fixture();
      input.lockfile.packages[path].dev = dev;
      assert.equal(assessDependencyAudit(input).ok, false, `${path}: ${dev}`);
    }
  }
});

test("moving a direct consumer to runtime dependencies invalidates the acknowledgement", () => {
  const input = fixture();
  input.lockfile.packages[""].dependencies.vinext = "1.1.0";
  delete input.lockfile.packages[""].devDependencies.vinext;
  assert.equal(assessDependencyAudit(input).ok, false);
});

test("runtime reachability overrides an inconsistent development-only lockfile flag", () => {
  const input = fixture();
  input.lockfile.packages["node_modules/react"].dependencies = { braces: "3.0.3" };
  assert.equal(assessDependencyAudit(input).ok, false);
});

test("a new high-severity consumer cannot silently extend the reviewed chain", () => {
  const input = fixture();
  input.report.vulnerabilities.surprise = vulnerability("surprise", ["braces"]);
  input.lockfile.packages["node_modules/surprise"] = { version: "1.0.0", dev: true, dependencies: { braces: "3.0.3" } };
  input.report.metadata.vulnerabilities.high = 9;
  input.report.metadata.vulnerabilities.total = 9;
  assert.equal(assessDependencyAudit(input).ok, false);
});

test("missing or cyclic dependency explanations fail closed", () => {
  for (const via of [["missing"], ["micromatch"], []]) {
    const input = fixture();
    input.report.vulnerabilities.braces.via = via;
    assert.equal(assessDependencyAudit(input).ok, false);
  }
});

test("audit dependency cascades must agree with installed lockfile edges", () => {
  const input = fixture();
  delete input.lockfile.packages["node_modules/micromatch"].dependencies.braces;
  assert.equal(assessDependencyAudit(input).ok, false);
});

test("the acknowledgement covers November 13 UTC and expires the next day", () => {
  assert.equal(assessDependencyAudit({ ...fixture(), now: new Date("2026-11-13T23:59:59.999Z") }).ok, true);
  const expired = assessDependencyAudit({ ...fixture(), now: new Date("2026-11-14T00:00:00Z") });
  assert.equal(expired.ok, false);
  assert.match(expired.failures.join(" "), /expir/i);
});

test("a clean audit passes after expiry without claiming an acknowledged vulnerability", () => {
  const input = fixture();
  input.now = new Date("2026-12-01T00:00:00Z");
  input.exitCode = 0;
  input.report.vulnerabilities = {};
  input.report.metadata.vulnerabilities.high = 0;
  input.report.metadata.vulnerabilities.total = 0;
  const result = assessDependencyAudit(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});

test("malformed audit records and metadata fail closed", () => {
  const mutations = [
    (input) => { input.report = null; },
    (input) => { input.report.auditReportVersion = 1; },
    (input) => { input.report.vulnerabilities = []; },
    (input) => { delete input.report.metadata; },
    (input) => { input.report.metadata.vulnerabilities.total = 0; },
    (input) => { input.report.vulnerabilities.braces.nodes = []; },
    (input) => { input.report.vulnerabilities.braces.nodes = [42]; },
    (input) => { input.report.vulnerabilities.braces.severity = "unknown"; },
    (input) => { input.report.vulnerabilities.braces.via[0].url = null; },
    (input) => { input.report.vulnerabilities.braces.name = "wrong"; },
    (input) => { input.report.vulnerabilities.braces.isDirect = "false"; },
    (input) => { input.report.vulnerabilities.braces.effects = "micromatch"; },
    (input) => { input.report.vulnerabilities.vinext.isDirect = false; },
    (input) => { input.now = new Date("invalid"); },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.equal(assessDependencyAudit(input).ok, false, mutate.toString());
  }
});

test("missing or malformed lockfile data cannot establish development-only reachability", () => {
  const mutations = [
    (input) => { input.lockfile = null; },
    (input) => { input.lockfile.lockfileVersion = 1; },
    (input) => { input.lockfile.packages = []; },
    (input) => { delete input.lockfile.packages[""]; },
    (input) => { delete input.lockfile.packages["node_modules/braces"]; },
    (input) => { delete input.lockfile.packages["node_modules/react"]; },
    (input) => { input.lockfile.packages["node_modules/braces"].version = null; },
    (input) => { input.lockfile.packages["node_modules/micromatch"].dependencies = []; },
    (input) => { input.lockfile.packages["node_modules/braces"].version = "3.0.4"; },
    (input) => { input.report.vulnerabilities.braces.nodes = ["../node_modules/braces"]; },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.equal(assessDependencyAudit(input).ok, false, mutate.toString());
  }
});

test("audit transport failures are not mistaken for a passing vulnerability scan", () => {
  for (const extra of [
    { exitCode: null }, { exitCode: 2 }, { exitCode: 127 }, { exitCode: "1" },
    { transportError: new Error("Registry unavailable") },
    { report: { error: { code: "ENOTFOUND", summary: "Registry unavailable" } } },
  ]) {
    assert.equal(assessDependencyAudit({ ...fixture(), ...extra }).ok, false);
  }
  const input = fixture();
  input.report.error = { code: "EAUDITNOLOCK", summary: "No lockfile" };
  assert.equal(assessDependencyAudit(input).ok, false);
});
