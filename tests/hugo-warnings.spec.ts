import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { target } from "./helpers/target";

// Parses the Hugo build log (path from CONFIG's `buildLog`) for ERROR and
// unexpected WARN lines. The consumer's `[allowlists].hugoWarnings` lets
// known-benign noise through (e.g. theme deprecations the consumer can't
// fix on its own).

const BUILD_LOG = target.buildLog;
const ALLOWLIST = target.hugoWarningsAllowlist;
const ENABLED = target.shouldRun("hugoWarnings");

test.describe("hugo build log is clean", () => {
  test.skip(!ENABLED, "hugoWarnings check disabled in CONFIG");
  test.skip(BUILD_LOG === null, "no buildLog configured in CONFIG");

  test("build log exists", () => {
    expect(
      BUILD_LOG && fs.existsSync(BUILD_LOG),
      `expected ${BUILD_LOG} from the build step`,
    ).toBe(true);
  });

  test("no ERROR lines from the build", () => {
    if (!BUILD_LOG || !fs.existsSync(BUILD_LOG)) {
      test.skip(true, "build log not present (skipping; existence test will fail)");
    }
    const log = fs.readFileSync(BUILD_LOG!, "utf8");
    const errors = log
      .split("\n")
      .filter((l) => /^ERROR\b/.test(l) || /\berror building site\b/.test(l));
    expect(errors, `errors in build log:\n${errors.join("\n")}`).toEqual([]);
  });

  test("no unexpected WARN lines from the build", () => {
    if (!BUILD_LOG || !fs.existsSync(BUILD_LOG)) {
      test.skip(true, "build log not present");
    }
    const log = fs.readFileSync(BUILD_LOG!, "utf8");
    const warns = log
      .split("\n")
      .filter((l) => /^WARN\b/.test(l))
      .filter((l) => !ALLOWLIST.some((re) => re.test(l)));
    expect(warns, `unexpected warnings:\n${warns.join("\n")}`).toEqual([]);
  });
});
