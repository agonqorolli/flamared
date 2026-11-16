import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { BUY_URL } from "@/brand";
import { useLicense } from "@/lib/license";

// Where a license key is pasted, in Settings and on the trial-ended screen. The key is checked on this Mac.
export function KeyForm({ autoFocus }: { autoFocus?: boolean }) {
  const { activate } = useLicense();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await activate(key);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="license-key">License key</FieldLabel>
        <Textarea
          id="license-key"
          value={key}
          onChange={(e) => (setKey(e.target.value), setError(null))}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), key.trim() && submit())}
          placeholder="Paste the key from your purchase email"
          aria-invalid={!!error || undefined}
          autoFocus={autoFocus}
          spellCheck={false}
          rows={3}
          className="resize-none font-mono text-xs break-all placeholder:font-sans"
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!key.trim() || busy}>
          {busy && <Spinner data-icon="inline-start" />}
          Activate
        </Button>
        {BUY_URL && <BuyButton variant="outline" />}
      </div>
    </form>
  );
}

export function BuyButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  return (
    <Button type="button" size="sm" variant={variant} onClick={() => openUrl(BUY_URL).catch(() => window.open(BUY_URL, "_blank"))}>
      Buy a license
    </Button>
  );
}
