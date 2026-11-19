// The product name lives here (and in src-tauri/tauri.conf.json "productName" / window title, which the OS reads).
export const APP_NAME = "Flamared";

// The public repo: release notes and problem reports (the updater's address is in tauri.conf.json).
export const REPO_URL = "https://github.com/agonqorolli/flamared";

// Where a license is bought: the license server (license-server/) redirects to the Stripe Payment Link, so the link
// and the launch price can change without a release. The Buy buttons stay hidden while it is empty.
export const BUY_URL = "https://flamared.com/buy";

// Where a year more of updates is bought for an existing license (the license server again); its Renew buttons stay
// hidden while it is empty.
export const RENEW_URL = "https://flamared.com/renew";
