export function ArchiveRecoveryGuide({ download }: { download: string }) {
  return <details className="dao-archive-details archive-recovery-guide">
    <summary>Recover & verify independently</summary>
    <ol>
      <li><strong>Keep your copy</strong><p>Download the revision and its chain receipt. The package contains the preserved files.</p></li>
      <li><strong>Restore the files</strong><p>Follow the included command to extract the Markdown and metadata into a new folder. It works offline.</p></li>
      <li><strong>Verify the timestamp</strong><p>Check the file hashes, batch inclusion and Zcash transaction with your own reader and node.</p></li>
    </ol>
    <div className="dao-archive-tools"><a className="dao-text-button" href={`${download}?file=VERIFY.md`}>Download recovery guide ↓</a><a className="dao-text-button" href="/verify/archive-verify.mjs" download>Download verifier ↓</a></div>
    <p className="archive-recovery-note">Zcash preserves the commitment. Keep the package to recover the contents.</p>
  </details>;
}
