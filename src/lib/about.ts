/** Facts shown in About: where the source lives and how it may be used. */
export const REPO_URL = "https://github.com/phomenfx/ShootingScriptLiner";
export const LICENSE_URL = `${REPO_URL}/blob/HEAD/LICENSE`;
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export function openRepo(): void {
  window.open(REPO_URL, "_blank", "noopener,noreferrer");
}
