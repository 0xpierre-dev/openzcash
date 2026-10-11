export type WorkspaceThemePreference = "system" | "light" | "dark";

export const WORKSPACE_THEME_COOKIE = "workspace-theme";
export const WORKSPACE_THEME_MAX_AGE = 60 * 60 * 24 * 365;

export function parseWorkspaceThemePreference(value: unknown): WorkspaceThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function workspaceThemeCookie(preference: WorkspaceThemePreference, secure: boolean): string {
  const value = parseWorkspaceThemePreference(preference);
  return `${WORKSPACE_THEME_COOKIE}=${value}; Path=/; Max-Age=${WORKSPACE_THEME_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const LEGACY_WORKSPACE_THEME_COOKIE = `${WORKSPACE_THEME_COOKIE}=; Path=/communities; Max-Age=0; SameSite=Lax`;
