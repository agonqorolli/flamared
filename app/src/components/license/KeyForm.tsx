import { type KeyboardEvent, useState } from "react";
import { BUY_URL } from "@/brand";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { openInBrowser } from "@/lib/api";
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
  // Enter sends the key; Shift+Enter starts a new line.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (key.trim()) submit();
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="license-key">License key</FieldLabel>
        <Textarea
          id="license-key"
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
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

function BuyButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  return (
    <Button type="button" size="sm" variant={variant} onClick={() => openInBrowser(BUY_URL)}>
      Buy a license
    </Button>
  );
}
