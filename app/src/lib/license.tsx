// The license and the trial, as src-tauri/src/license.rs reports them. Checked once before the first render and
// again every hour, so a window left open notices the trial ending.
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { activateLicense, inTauri, licenseStatus, removeLicense } from "./api";
import { utcToday } from "./format";
import type { LicenseStatus } from "./types";

export const TRIAL_DAYS = 14;
const DAY_SECONDS = 86400;
const HOUR_MS = 60 * 60 * 1000;
const BAD_KEY = "That isn't a valid license key. Copy the whole key from your purchase email and try again.";

// --- In a plain browser (development preview) there is no license file: `?license=ended`, `?license=licensed`,
// `?license=lapsed` (licensed, updates ended), `?license=renew` (this version came out after the updates ended) or
// `?license=3` (days left) shows each state, and the key "test" activates.

const PREVIEW_HOLDER = { name: "Test Buyer", email: "test@example.com", id: "1", issued: "2026-11-16" };
const PREVIEW_LICENSED: LicenseStatus = { state: "licensed", holder: PREVIEW_HOLDER, updates_until: "2027-11-16" };

function previewStatus(): LicenseStatus {
  const want = new URLSearchParams(location.search).get("license");
  const now = Math.floor(Date.now() / 1000);
  if (want === "ended") return { state: "ended", ended: now - DAY_SECONDS };
  if (want === "licensed") return PREVIEW_LICENSED;
  if (want === "lapsed") {
    return { state: "licensed", holder: { ...PREVIEW_HOLDER, issued: "2024-11-01" }, updates_until: "2025-11-01" };
  }
  if (want === "renew") {
    return { state: "not_covered", holder: PREVIEW_HOLDER, updates_until: "2027-11-16", released: "2027-12-03" };
  }
  const days = Math.max(1, Number(want) || TRIAL_DAYS);
  return { state: "trial", days_left: days, ends: now + days * DAY_SECONDS };
}

function previewActivate(key: string): Promise<LicenseStatus> {
  return key.trim() === "test" ? Promise.resolve(PREVIEW_LICENSED) : Promise.reject(BAD_KEY);
}

function previewRemove(): Promise<LicenseStatus> {
  return Promise.resolve({ state: "trial", days_left: TRIAL_DAYS, ends: Date.now() / 1000 + TRIAL_DAYS * DAY_SECONDS });
}

// --- The license as the window uses it

export const loadLicense = (): Promise<LicenseStatus> => (inTauri ? licenseStatus() : Promise.resolve(previewStatus()));
const activateKey = (key: string) => (inTauri ? activateLicense(key) : previewActivate(key));
const removeKey = () => (inTauri ? removeLicense() : previewRemove());

interface License {
  status: LicenseStatus;
  activate: (key: string) => Promise<void>; // throws the reason a key isn't valid
  remove: () => Promise<void>;
}
const LicenseContext = createContext<License | null>(null);

export function LicenseProvider({ initial, children }: { initial: LicenseStatus; children: ReactNode }) {
  const [status, setStatus] = useState(initial);
  useEffect(() => {
    const hourly = setInterval(() => loadLicense().then(setStatus, () => {}), HOUR_MS);
    return () => clearInterval(hourly);
  }, []);
  const license: License = {
    status,
    activate: async (key) => setStatus(await activateKey(key).catch((e) => Promise.reject(String(e)))),
    remove: async () => setStatus(await removeKey()),
  };
  return <LicenseContext.Provider value={license}>{children}</LicenseContext.Provider>;
}

export function useLicense() {
  const license = useContext(LicenseContext);
  if (!license) throw new Error("useLicense needs a LicenseProvider");
  return license;
}

// Whether a version released on `released` (YYYY-MM-DD) takes this license: always in the trial; with a key, only
// while its updates lasted.
export function coversRelease(status: LicenseStatus, released: string) {
  if (status.state === "licensed" || status.state === "not_covered") return released <= status.updates_until;
  return true;
}

// Whether a license's updates have ended: versions released from today on won't take it.
export const updatesEnded = (updatesUntil: string) => updatesUntil < utcToday();

// "Nov 15, 2026", from YYYY-MM-DD
export function longDate(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// "Nov 15"
export const shortDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
