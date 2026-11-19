import { type KeyboardEvent, useState } from "react";
import { BUY_URL, RENEW_URL } from "@/brand";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { openInBrowser } from "@/lib/api";
import { useLicense } from "@/lib/license";

// What the store button beside Activate sells: a license, or a year more of updates for one.
export type Purchase = "buy" | "renew";

const STORE = {
  buy: { url: BUY_URL, label: "Buy a license", placeholder: "Paste the key from your purchase email" },
  renew: { url: RENEW_URL, label: "Renew updates", placeholder: "Paste the new key from your renewal email" },
};

interface Props {
  purchase: Purchase;
  autoFocus?: boolean;
}

// Where a license key is pasted, in Settings and on the screens that ask for one. The key is checked on this Mac.
export function KeyForm({ purchase, autoFocus }: Props) {
  const store = STORE[purchase];
  const { activate } = useLicense();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    // Enter while a check is running, or with nothing pasted, does nothing.
    if (busy || !key.trim()) return;
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
    submit();
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
          placeholder={store.placeholder}
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
        {store.url && (
          <Button type="button" size="sm" variant="outline" onClick={() => openInBrowser(store.url)}>
            {store.label}
          </Button>
        )}
      </div>
    </form>
  );
}
