import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

let canvas: HTMLCanvasElement | null = null;

// A folder path that keeps both ends when it doesn't fit: "~/Library/.../scratch-2026-11-16". The start (with ~ or
// the root, one folder deep) and as many folders from the end as fit; the full path is on hover. Refits when the
// space changes.
export function MiddlePath({ path, className }: { path: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(path);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const ctx = (canvas ??= document.createElement("canvas")).getContext("2d");
      if (!ctx || !el.clientWidth) return setShown(path);
      ctx.font = getComputedStyle(el).font;
      setShown(shortenPath(path, (t) => ctx.measureText(t).width <= el.clientWidth));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [path]);
  return (
    <span ref={ref} title={path} className={cn("block truncate", className)}>
      {shown}
    </span>
  );
}

// The longest "start/.../end" form of `path` that fits; the shortest ("start/.../last") when nothing does, which the
// truncate class then cuts at the end.
export function shortenPath(path: string, fits: (text: string) => boolean): string {
  if (fits(path)) return path;
  const parts = path.split("/");
  const head = parts.slice(0, parts[0] === "~" || parts[0] === "" ? 2 : 1).join("/");
  const rest = parts.length - head.split("/").length;
  for (let k = rest - 1; k >= 1; k--) {
    const text = `${head}/.../${parts.slice(-k).join("/")}`;
    if (fits(text)) return text;
  }
  return `${head}/.../${parts[parts.length - 1]}`;
}
