import { useId } from "react";
import { cn } from "@/lib/utils";

// The flame of the app icon (src-tauri/icons/app-icon.svg), in its own coordinates: the outline that clips
// everything, the solid top, and the code lines below it.
const VIEW_BOX = "300 200 440 630";
const OUTLINE =
  "M528 214 C 548 318, 712 392, 712 580 C 712 714, 622 812, 512 812 C 402 812, 312 718, 312 598 " +
  "C 312 506, 360 446, 408 402 C 404 468, 428 512, 470 532 C 446 418, 470 300, 528 214 Z";
const TOP = { x: 300, y: 200, width: 440, height: 370 };

// One stretch of a code line, and when the green starts typing across it, in seconds into the animation's loop
// (--animate-logo-type in index.css). A line's first stretch starts left of the flame so its rounded end is hidden,
// as in the icon. `green` marks the icon's own green line, shown still when the system asks for less motion.
interface Stretch {
  x: number;
  y: number;
  width: number;
  height: number;
  delay: number;
  green?: boolean;
}

const STRETCHES: Stretch[] = [
  { x: 277, y: 590, width: 319, height: 46, delay: 0 },
  { x: 614, y: 590, width: 126, height: 46, delay: 0.3 },
  { x: 277, y: 654, width: 463, height: 46, delay: 0.7 },
  { x: 277, y: 718, width: 193, height: 46, delay: 1.4, green: true },
  { x: 488, y: 718, width: 252, height: 46, delay: 1.7, green: true },
  { x: 280, y: 782, width: 460, height: 40, delay: 2.1 },
];

// The loading animation: the logo stands still while green types across its code lines, one after another. With
// reduced motion it is the icon as it is (one green line), fading gently.
export function LogoLoader({ label, className }: { label: string; className?: string }) {
  // useId can contain characters that break url(#…) references, so keep only the safe ones.
  const id = useId().replace(/[^\w-]/g, "");
  const flame = `url(#${id}-flame)`;
  return (
    <svg
      role="status"
      aria-label={label}
      viewBox={VIEW_BOX}
      className={cn("h-12 motion-reduce:animate-pulse", className)}
    >
      <defs>
        <linearGradient id={`${id}-flame`} gradientUnits="userSpaceOnUse" x1="0" y1="214" x2="0" y2="812">
          <stop offset="0" className="[stop-color:var(--logo-flame-top)]" />
          <stop offset="0.6" className="[stop-color:var(--logo-flame)]" />
          <stop offset="1" className="[stop-color:var(--logo-flame-bottom)]" />
        </linearGradient>
        <clipPath id={`${id}-outline`}>
          <path d={OUTLINE} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-outline)`}>
        <rect {...TOP} fill={flame} />
        {STRETCHES.map((stretch, index) => (
          <rect key={`line-${index}`} {...lineShape(stretch)} fill={flame} />
        ))}
        {STRETCHES.map((stretch, index) => (
          <rect
            key={`green-${index}`}
            {...lineShape(stretch)}
            style={{ animationDelay: `${stretch.delay}s` }}
            className={cn(
              "origin-left animate-logo-type fill-logo-line [transform-box:fill-box]",
              stretch.green ? "motion-reduce:animate-none" : "motion-reduce:hidden",
            )}
          />
        ))}
      </g>
    </svg>
  );
}

// A stretch as SVG rect attributes: fully rounded ends.
function lineShape({ x, y, width, height }: Stretch) {
  return { x, y, width, height, rx: height / 2 };
}
