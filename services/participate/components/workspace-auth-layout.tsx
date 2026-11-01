import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { WorkspaceThemeProvider } from "@/components/workspace-theme";
import { parseWorkspaceThemePreference, WORKSPACE_THEME_COOKIE } from "@/lib/domain/workspace-theme";
import "@/app/workspace.css";
import "@/app/workspace-auth.css";

export async function WorkspaceAuthLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const preference = parseWorkspaceThemePreference(cookieStore.get(WORKSPACE_THEME_COOKIE)?.value);
  return <WorkspaceThemeProvider initialPreference={preference}>{children}</WorkspaceThemeProvider>;
}
