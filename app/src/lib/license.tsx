// The license and the trial, as src-tauri/src/license.rs reports them. Checked once before the first render and
// again every hour, so a window left open notices the trial ending.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Holder {
  name: string;
  email: string;
  id: string;
  issued: string; // YYYY-MM-DD
}

export type LicenseStatus =
  | { state: "licensed"; holder: Holder }
  | { state: "trial"; days_left: number; ends: number } // ends: seconds since 1970
  | { state: "ended"; ended: number };

export const TRIAL_DAYS = 14;
const inTauri = "__TAURI_INTERNALS__" in window;
const BAD_KEY = "That isn't a valid license key. Copy the whole key from your purchase email and try again.";

// In a plain browser (development preview) there is no license file: `?license=ended`, `?license=licensed` or
// `?license=3` (days left) shows each state, and the key "test" activates.
function preview(): LicenseStatus {
  const want = new URLSearchParams(location.search).get("license");
  const now = Math.floor(Date.now() / 1000);
  if (want === "ended") return { state: "ended", ended: now - 86400 };
  if (want === "licensed")
    return {
      state: "licensed",
      holder: {
        name: "Test Buyer",
        email: "test@example.com",
        id: "1",
        issued: "2026-11-16",
      },
    };
  const days = Math.max(1, Number(want) || TRIAL_DAYS);
  return { state: "trial", days_left: days, ends: now + days * 86400 };
}

export const loadLicense = (): Promise<LicenseStatus> =>
  inTauri ? invoke<LicenseStatus>("license_status") : Promise.resolve(preview());

const activateKey = (key: string): Promise<LicenseStatus> => {
  if (inTauri) return invoke<LicenseStatus>("license_activate", { key });
  return key.trim() === "test"
    ? Promise.resolve({
        state: "licensed",
        holder: {
          name: "Test Buyer",
          email: "test@example.com",
          id: "1",
          issued: "2026-11-16",
        },
      })
    : Promise.reject(BAD_KEY);
};
const removeKey = (): Promise<LicenseStatus> =>
  inTauri
    ? invoke<LicenseStatus>("license_remove")
    : Promise.resolve({
        state: "trial",
        days_left: TRIAL_DAYS,
        ends: Date.now() / 1000 + TRIAL_DAYS * 86400,
      });

interface License {
  status: LicenseStatus;
  activate: (key: string) => Promise<void>; // throws the reason a key isn't valid
  remove: () => Promise<void>;
}
const Ctx = createContext<License | null>(null);

export function LicenseProvider({ initial, children }: { initial: LicenseStatus; children: ReactNode }) {
  const [status, setStatus] = useState(initial);
  useEffect(() => {
    const t = setInterval(() => loadLicense().then(setStatus, () => {}), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const value: License = {
    status,
    activate: async (key) => setStatus(await activateKey(key).catch((e) => Promise.reject(String(e)))),
    remove: async () => setStatus(await removeKey()),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLicense() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLicense needs a LicenseProvider");
  return c;
}

// "Nov 15"
export const shortDate = (secs: number) =>
  new Date(secs * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
