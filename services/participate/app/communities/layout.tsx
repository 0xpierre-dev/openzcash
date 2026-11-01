import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WorkspaceThemeProvider } from "@/components/workspace-theme";
import { parseWorkspaceThemePreference, WORKSPACE_THEME_COOKIE } from "@/lib/domain/workspace-theme";
import "@/app/workspace.css";
import "@/app/treasury.css";
import "@/app/workspace-auth.css";
import "@/app/proposal-markdown.css";
import "@/app/proposal-editor.css";
import "@/app/credits.css";
import "@/app/credit-topup.css";
import "@/app/participation.css";
import "@/app/signed-decision.css";
import "@/app/proposal-participation.css";
import "@/app/coinholder.css";
import "@/app/coinholder-chart-help.css";
import "@/app/coinholder-share-weight.css";
import "@/app/coinholder-decision.css";
import "@/app/coinholder-heatmap.css";

export const metadata: Metadata = {
  title: "Proposals & DAO",
  description: "Community proposals, discussions, and shared treasury records."
};

export default async function CommunitiesLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const preference = parseWorkspaceThemePreference(cookieStore.get(WORKSPACE_THEME_COOKIE)?.value);
  return <WorkspaceThemeProvider initialPreference={preference}>{children}</WorkspaceThemeProvider>;
}
