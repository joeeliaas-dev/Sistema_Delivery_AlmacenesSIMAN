import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PREVIEW_URL = process.env.E2E_URL ?? 'http://localhost:8081';
const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].find(existsSync);
const PHOTO = join(root, 'assets', 'icon.png');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function openPhone({ width = 360, height = 780, out }) {
  mkdirSync(out, {
    recursive: true,
  });
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'e2e-'))}`,
      'about:blank',
    ],
    {
      stdio: 'ignore',
    },
  );
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0;
  const pending = new Map();
  const handlers = {};
  const consoleErrors = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) handlers[msg.method]?.(msg.params);
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++seq;
      pending.set(id, r);
      ws.send(
        JSON.stringify({
          id,
          method,
          params,
        }),
      );
    });
  const evaluate = async (expression) =>
    (
      await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result?.result?.value;
  handlers['Runtime.exceptionThrown'] = (p) =>
    consoleErrors.push(p.exceptionDetails?.exception?.description ?? 'excepción');
  handlers['Runtime.consoleAPICalled'] = (p) =>
    p.type === 'error' && consoleErrors.push(p.args?.map((a) => a.value ?? a.description).join(' '));
  handlers['Page.javascriptDialogOpening'] = () =>
    send('Page.handleJavaScriptDialog', {
      accept: true,
    });
  handlers['Page.fileChooserOpened'] = (p) =>
    send('DOM.setFileInputFiles', {
      files: [PHOTO],
      backendNodeId: p.backendNodeId,
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');
  await send('Page.setInterceptFileChooserDialog', {
    enabled: true,
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  const bodyText = () => evaluate('document.body.innerText');
  async function waitFor(test, label, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const text = await bodyText();
      if (typeof test === 'string' ? text?.includes(test) : test.test(text ?? '')) return;
      await sleep(250);
    }
    throw new Error(`No apareció: ${label ?? test}`);
  }
  const centerOf = (text) =>
    evaluate(`(() => {
      const want = ${JSON.stringify(text)};
      const els = [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (el.innerText || '').trim() === want;
      });
      if (!els.length) return null;
      els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
      els[0].scrollIntoView({ block: 'center', inline: 'center' });
      const r = els[0].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
  const mouse = (type, x, y, extra = {}) =>
    send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      ...extra,
    });
  async function tap(text) {
    let p;
    const end = Date.now() + 10000;
    while (!(p = await centerOf(text)) && Date.now() < end) await sleep(250);
    if (!p) throw new Error(`No encontré el botón: ${text}`);
    await sleep(150);
    await mouse('mousePressed', p.x, p.y);
    await mouse('mouseReleased', p.x, p.y);
    await sleep(400);
  }
  async function typeInto(selector, text) {
    await evaluate(`(() => {
      const visible = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      const el = visible.at(-1);
      el.scrollIntoView({ block: 'center' });
      el.focus();
    })()`);
    await send('Input.insertText', {
      text,
    });
    await sleep(200);
  }
  async function sign() {
    const box = await evaluate(`(() => {
      const c = [...document.querySelectorAll('canvas')].filter((el) => el.getClientRects().length).at(-1);
      c.scrollIntoView({ block: 'center' });
      const r = c.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })()`);
    const pts = Array.from(
      {
        length: 12,
      },
      (_, i) => ({
        x: box.x + box.w * (0.15 + 0.06 * i),
        y: box.y + box.h * (0.5 + 0.25 * Math.sin(i)),
      }),
    );
    await mouse('mousePressed', pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) await mouse('mouseMoved', p.x, p.y);
    await mouse('mouseReleased', pts.at(-1).x, pts.at(-1).y);
    await sleep(300);
  }
  const scrollTop = () =>
    evaluate(
      `(() => { document.querySelectorAll('*').forEach((el) => { if (el.scrollTop) el.scrollTop = 0; }); window.scrollTo(0, 0); })()`,
    );
  let shot = 0;
  async function screenshot(name) {
    const { result } = await send('Page.captureScreenshot', {
      format: 'png',
    });
    writeFileSync(join(out, `${String(++shot).padStart(2, '0')}-${name}.png`), Buffer.from(result.data, 'base64'));
  }
  const navigate = (url) =>
    send('Page.navigate', {
      url,
    });
  const close = () => {
    ws.close();
    chrome.kill();
  };
  return {
    send,
    evaluate,
    waitFor,
    tap,
    typeInto,
    sign,
    scrollTop,
    screenshot,
    navigate,
    close,
    consoleErrors,
  };
}
