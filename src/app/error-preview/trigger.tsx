"use client";

import { useState } from "react";

export function ErrorPreviewTrigger() {
  const [failed, setFailed] = useState(false);
  if (failed) throw new Error("Local error-boundary recovery test");
  return <div style={{ padding: 40 }}><h1>Recovery test</h1><p>This local test triggers the real page error boundary.</p><button type="button" onClick={() => setFailed(true)} style={{ padding: 16, marginTop: 20, border: "1px solid currentColor", borderRadius: 8 }}>Simulate page error</button></div>;
}
