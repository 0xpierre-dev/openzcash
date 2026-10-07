/** Inline, scoped CSS keeps global and edge fallbacks independent of Next assets. */
export const ERROR_STYLES = `
.oz-error{--error-bg:var(--bg,#faf8f4);--error-ink:var(--ink,#1c1917);--error-muted:var(--muted,#57534e);--error-line:var(--line,#e9e3d6);--error-gold:#b7791f;background:var(--error-bg);color:var(--error-ink);font-family:var(--font-geist,"Helvetica Neue"),Arial,sans-serif;min-height:calc(100svh - 200px);padding:32px 28px;box-sizing:border-box;display:grid;place-items:center;text-align:left}
.oz-error *{box-sizing:border-box}
.oz-error--standalone{min-height:100svh;padding:max(28px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
.oz-error-wrap{width:100%;max-width:1000px;margin:0 auto}
.oz-error-brand{display:inline-flex;align-items:center;gap:6px;color:var(--error-ink);text-decoration:none;font-size:21px;font-weight:750;letter-spacing:-.7px}
.oz-error-brand img{display:block;margin-left:-10px;object-fit:contain}
.oz-error-dot{color:var(--error-gold)}
.oz-error-main{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(220px,1fr);align-items:center;gap:28px;padding:72px 0 64px}
.oz-error-label{display:flex;align-items:center;gap:10px;color:var(--error-muted);font-size:11px;line-height:1.5;font-weight:650;letter-spacing:1.7px;text-transform:uppercase;margin:0 0 24px}
.oz-error-label>span{width:7px;height:7px;background:#b7791f;border-radius:50%;flex-shrink:0}
.oz-error h1{font-family:var(--font-geist,"Helvetica Neue"),Arial,sans-serif;font-size:clamp(36px,4.3vw,60px);line-height:1.05;letter-spacing:-2.5px;max-width:560px;margin:0 0 24px;font-weight:650;text-wrap:balance;color:var(--error-ink)}
.oz-error-description{font-size:17px;line-height:1.7;max-width:405px;margin:0;color:var(--error-muted)}
.oz-error-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:32px}
.oz-error-actions>a,.oz-error-actions>button{min-height:48px;padding:12px 20px;display:inline-flex;align-items:center;justify-content:center;gap:10px;font:600 14px/1.5 var(--font-geist,"Helvetica Neue"),Arial,sans-serif;text-decoration:none;border-radius:9px;cursor:pointer;transition:background .15s ease}
.oz-error-primary{background:#f4b728;border:1px solid #f4b728;color:#1c1917}
.oz-error-primary:hover{background:#ffc64a}
.oz-error-secondary{background:transparent;border:1px solid var(--error-line);color:var(--error-ink)}
.oz-error-secondary:hover{background:var(--surface2,#f6f3ec)}
.oz-error :is(a,button):focus-visible{outline:3px solid var(--error-gold);outline-offset:4px;box-shadow:none}
.oz-error-hint{font-size:12px;line-height:1.6;color:var(--error-muted);margin:22px 0 0}
.oz-error-art{position:relative;width:100%;max-width:360px;aspect-ratio:1;display:grid;place-items:center;justify-self:center}
.oz-error-art img{position:relative;display:block;width:88%;height:auto;filter:drop-shadow(0 16px 25px rgba(183,121,31,.1))}
.oz-error-orbit{position:absolute;border:1px solid var(--error-line);border-radius:50%;inset:3%}
.oz-error-orbit--inner{inset:16%;border-style:dashed}
.oz-error-orbit-dot{position:absolute;top:17%;right:14%;width:10px;height:10px;border-radius:50%;background:#f4b728;box-shadow:0 0 0 6px var(--error-bg)}
.oz-error-footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--error-line);padding-top:20px;font-size:12px;line-height:1.5;color:var(--error-muted)}
.oz-error-footer>span:last-child{font-size:10px;letter-spacing:1.8px}
@media(prefers-color-scheme:dark){.oz-error--standalone{--error-bg:#0f0e0c;--error-ink:#f5f5f4;--error-muted:#b9b2a9;--error-line:#37332b;--surface2:#1d1b18;--error-gold:#d9a441;color-scheme:dark}}
@media(max-width:620px){.oz-error{padding:24px 8px;min-height:calc(100svh - 200px)}.oz-error--standalone{padding:28px 24px;min-height:100svh}.oz-error-main{grid-template-columns:1fr;gap:0;padding:32px 0 36px}.oz-error-art{grid-row:1;width:152px;margin:0 auto 30px}.oz-error-copy{text-align:center}.oz-error-label{justify-content:center;margin-bottom:18px;font-size:10px}.oz-error h1{font-size:38px;letter-spacing:-1.5px;max-width:350px;margin:0 auto 20px}.oz-error-description{font-size:16px;max-width:330px;margin:0 auto}.oz-error-actions{justify-content:center;gap:10px;margin-top:28px}.oz-error-actions>a,.oz-error-actions>button{padding:12px 16px}.oz-error-hint{max-width:260px;margin:20px auto 0}.oz-error-footer{font-size:11px}.oz-error-footer>span:last-child{display:none}}
@media(prefers-reduced-motion:reduce){.oz-error *{transition:none!important}}
`;
