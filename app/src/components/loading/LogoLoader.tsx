import { useId } from "react";
import { cn } from "@/lib/utils";

// The flame of the app icon (src-tauri/icons/app-icon.svg), in its own coordinates: the outline that clips
// everything, the solid top, and the code lines below it.
const VIEW_BOX = "300 190 440 640";
const OUTLINE =
  "M312 612 A 200 200 0 0 0 712 612 C 712 500, 680 420, 640 350 C 610 300, 590 260, 583 218 " +
  "C 581 207, 575 206, 568 214 C 519 271, 470 350, 462 420 C 459 448, 461 466, 466 482 " +
  "C 430 460, 397 428, 390 366 C 389 356, 384 355, 378 362 C 340 409, 312 500, 312 612 Z";
const TOP = { x: 300, y: 190, width: 440, height: 350 };

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
  { x: 280, y: 572, width: 296, height: 64, delay: 0 },
  { x: 608, y: 572, width: 140, height: 64, delay: 0.3 },
  { x: 280, y: 668, width: 168, height: 64, delay: 0.8, green: true },
  { x: 480, y: 668, width: 268, height: 64, delay: 1.1, green: true },
  { x: 280, y: 764, width: 460, height: 66, delay: 1.6 },
];

// The loading animation: the logo stands still while green types across its code lines, one after another. With
// reduced motion it is the icon as it is (one green line), fading gently.
export function LogoLoader({ label, className }: { label: string; className?: string }) {
  // useId can contain characters that break url(#…) references, so keep only the safe ones.
  const id = useId().replace(/[^\w-]/g, "");
  return (
    <svg
      role="status"
      aria-label={label}
      viewBox={VIEW_BOX}
      className={cn("h-12 motion-reduce:animate-pulse", className)}
    >
      <defs>
        <clipPath id={`${id}-outline`}>
          <path d={OUTLINE} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-outline)`}>
        <rect {...TOP} className="fill-logo-flame" />
        {STRETCHES.map((stretch, index) => (
          <rect key={`line-${index}`} {...lineShape(stretch)} className="fill-logo-flame" />
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
