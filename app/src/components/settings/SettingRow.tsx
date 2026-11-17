// The parts every Settings section is built from.
import { RotateCcwIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

// The part of a section under its heading; it scrolls when the settings don't fit.
export function SettingsBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)}>{children}</div>;
}

interface RowProps {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string; // the id of the control, when clicking the label should reach it
  children?: ReactNode; // the control
}

// One setting: its name with a line about it on the left, its control on the right.
export function SettingRow({ label, description, htmlFor, children }: RowProps) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      {children}
    </Field>
  );
}

interface ChoiceProps<T extends string | number> {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}

// A setting with a few values to pick from, shown side by side.
export function Choice<T extends string | number>({ value, options, onChange }: ChoiceProps<T>) {
  const pick = (picked: string) => {
    const option = options.find((option) => String(option.value) === picked);
    if (option) onChange(option.value);
  };
  return (
    <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={String(value)} onValueChange={pick}>
      {options.map((option) => (
        <ToggleGroupItem key={String(option.value)} value={String(option.value)}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <RotateCcwIcon data-icon="inline-start" />
      Reset to defaults
    </Button>
  );
}
