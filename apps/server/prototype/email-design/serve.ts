// PROTOTYPE (#989 Email design standard): preview server + Mailpit sender. Throwaway.
// Run from apps/server: bun prototype/email-design/serve.ts  → http://localhost:4599

import { APP_NAME, identities, PLATFORM_LOGO, samples } from './samples';
import { textVersion, variants } from './variants';
import type { EmailContent } from '@/infrastructure/services/email-layout';
import { prepareEmail } from '@/infrastructure/services/email-templates';

const PORT = 4599;
const ORIGIN = `http://localhost:${PORT}`;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const dir = import.meta.dir;

function capture(kind: string, churchName: string): EmailContent {
  let captured: EmailContent | undefined;
  (globalThis as { __emailLayoutHook?: unknown }).__emailLayoutHook = (
    c: EmailContent,
  ) => {
    captured = c;
    return { subject: '', html: '', text: '' };
  };
  const payload = JSON.parse(
    JSON.stringify(samples[kind]).replaceAll('CHURCH', churchName),
  );
  prepareEmail({
    payload,
    from: 'x@example.com',
    locale: 'pt-BR',
    appName: APP_NAME,
  });
  if (!captured) throw new Error(`no content for ${kind}`);
  return captured;
}

function render(variant: string, kind: string, identityKey: string) {
  const identity =
    kind === 'auth.password-reset' ? null : (identities[identityKey] ?? null);
  const content = capture(kind, identity?.churchName ?? APP_NAME);
  const input = {
    content,
    identity,
    platformLogo: PLATFORM_LOGO,
    origin: ORIGIN,
  };
  const v = variants[variant as keyof typeof variants] ?? variants.A;
  return {
    subject: content.subject,
    html: v.render(input),
    text: textVersion(input),
    fromName: identity?.churchName ?? APP_NAME,
  };
}

async function sendToMailpit(variant: string, identityKey: string) {
  for (const kind of Object.keys(samples)) {
    const r = render(variant, kind, identityKey);
    const res = await fetch(`${MAILPIT}/api/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: { Email: 'onboarding@church.test', Name: r.fromName },
        To: [{ Email: 'maria@example.com' }],
        Subject: `[${variant}·${identityKey}] ${r.subject}`,
        HTML: r.html,
        Text: r.text,
        Tags: [`variant-${variant}`],
      }),
    });
    if (!res.ok) throw new Error(`Mailpit ${res.status}: ${await res.text()}`);
  }
}

const index = (
  kinds: string[],
  ids: string[],
) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>PROTOTYPE · Email design standard</title>
<style>
body{margin:0;font:14px system-ui;background:#e5e5e5}
header{display:flex;gap:12px;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid #ccc;flex-wrap:wrap}
select,button{font:inherit;padding:4px 8px}
main{display:flex;gap:16px;padding:16px;justify-content:center;align-items:flex-start}
iframe{border:1px solid #bbb;background:#fff;height:calc(100vh - 140px)}
pre{white-space:pre-wrap;background:#fff;border:1px solid #bbb;padding:12px;width:340px;margin:0;max-height:calc(100vh - 165px);overflow:auto;font-size:12px}
#bar{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border-radius:999px;padding:8px 14px;display:flex;gap:12px;align-items:center;box-shadow:0 4px 16px #0005;z-index:9}
#bar button{background:#333;color:#fff;border:0;border-radius:999px;cursor:pointer}
</style></head><body>
<header><b>PROTOTYPE</b> Email kind <select id="kind">${kinds.map((k) => `<option>${k}</option>`).join('')}</select>
Identity <select id="id">${ids.map((k) => `<option>${k}</option>`).join('')}</select>
Width <select id="w"><option value="680">desktop</option><option value="375">mobile 375</option><option value="320">mobile 320</option></select>
<label><input type="checkbox" id="txt"> plain text</label>
<button id="send">Send all kinds of this variant + identity to Mailpit</button><span id="status"></span>
<a href="${MAILPIT}" target="_blank">Open Mailpit</a></header>
<main><iframe id="f"></iframe><pre id="t" hidden></pre></main>
<div id="bar"><button id="prev">&larr;</button><span id="label"></span><button id="next">&rarr;</button></div>
<script>
const V=${JSON.stringify(Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, v.name])))};const keys=Object.keys(V);
const q=new URLSearchParams(location.search);const $=(id)=>document.getElementById(id);
for(const k of ['kind','id','w']) if(q.get(k)) $(k).value=q.get(k);
let v=keys.includes(q.get('variant'))?q.get('variant'):'A';
function go(){q.set('variant',v);q.set('kind',$('kind').value);q.set('id',$('id').value);q.set('w',$('w').value);history.replaceState(null,'','?'+q);
 $('label').textContent=v+' ('+V[v]+')';const src='/email?'+q;$('f').src=src;$('f').style.width=$('w').value+'px';
 $('t').hidden=!$('txt').checked;if($('txt').checked)fetch(src+'&text=1').then(r=>r.text()).then(t=>$('t').textContent=t);}
const step=(d)=>{v=keys[(keys.indexOf(v)+d+keys.length)%keys.length];go();};
$('prev').onclick=()=>step(-1);$('next').onclick=()=>step(1);
for(const k of ['kind','id','w','txt']) $(k).onchange=go;
addEventListener('keydown',(ev)=>{if(ev.target.closest('input,select,textarea,[contenteditable]'))return;if(ev.key==='ArrowLeft')step(-1);if(ev.key==='ArrowRight')step(1);});
$('send').onclick=async()=>{$('status').textContent='sending…';const r=await fetch('/send?'+q,{method:'POST'});$('status').textContent=r.ok?'sent ✓':'failed: '+await r.text();};
go();
</script></body></html>`;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const u = new URL(req.url);
    const get = (k: string, d: string) => u.searchParams.get(k) ?? d;
    if (u.pathname === '/')
      return new Response(
        index(Object.keys(samples), Object.keys(identities)),
        { headers: { 'content-type': 'text/html' } },
      );
    if (u.pathname === '/email') {
      const r = render(
        get('variant', 'A'),
        get('kind', 'auth.password-reset'),
        get('id', 'wide-navy'),
      );
      return u.searchParams.has('text')
        ? new Response(r.text)
        : new Response(r.html, {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
    }
    if (u.pathname === '/send' && req.method === 'POST') {
      await sendToMailpit(get('variant', 'A'), get('id', 'wide-navy'));
      return new Response('ok');
    }
    if (u.pathname === '/logos/platform.png')
      return new Response(Bun.file(`${dir}/../../../web/public/logo.png`));
    if (u.pathname.startsWith('/logos/'))
      return new Response(
        Bun.file(
          `${dir}/logos/${u.pathname.slice(7).replace(/[^a-z.-]/g, '')}`,
        ),
      );
    return new Response('not found', { status: 404 });
  },
});
console.log(`PROTOTYPE email design → ${ORIGIN}`);
