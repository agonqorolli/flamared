import { createCn } from "cn/config";

// Class-name merging that knows the app's own theme names (index.css @theme), so `text-micro` counts as a text size
// and `tracking-label` as letter spacing. Without this, `cn("text-micro text-faint")` would read both as colors and
// drop the size. Every component imports cn from here, shadcn's included.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "mini", "name"] }],
      tracking: [{ tracking: ["label"] }],
    },
  },
});
