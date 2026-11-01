import { notFound } from "next/navigation";

// Whole-wallet diagnostics cannot enforce community authorization.
export default async function AdminLiveFallbackPage() {
  notFound();
}
