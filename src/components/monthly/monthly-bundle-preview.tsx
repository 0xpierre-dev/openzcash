"use client";
import { MonthlyBundle } from "./monthly-bundle";
import data from "./bundle-preview-data.json";
import type { MonthlyReadingSet } from "@/lib/monthly/catalog";
import type { PublicationView } from "@/lib/monthly/reading-set";

const sample = { ...data, id: data.documents.monthly.id, evidenceCutoff: data.documents.monthly.periodEnd } as MonthlyReadingSet;
export function MonthlyBundlePreview({initialView}: {initialView:PublicationView}) {
  return <MonthlyBundle data={sample} editions={[sample.documents.monthly]} initialView={initialView} preview basePath="/monthly-preview"/>;
}
