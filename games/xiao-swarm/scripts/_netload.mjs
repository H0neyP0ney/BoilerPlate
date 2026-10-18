// Mesure temporaire : charge réseau et CPU d'une partie coop (hôte + client) jusqu'au Scarab.
import { createServer } from 'vite';

const SECONDS = Number(process.argv[2] ?? 330);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { HostSession } = await vite.ssrLoadModule('/src/net/HostSession.ts');
  const { ClientSession } = await vite.ssrLoadModule('/src/net/ClientSession.ts');
  const { LoopbackHub } = await vite.ssrLoadModule('/src/net/LoopbackTransport.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { takeSnapshot, encodeSnapshot } = await vite.ssrLoadModule('/src/net/Protocol.ts');

  const hub = new LoopbackHub();
  const hostT = hub.createTransport();
  const win = { snapN: 0, snapB: 0, snapMax: 0, evN: 0, evB: 0, evMax: 0, kinds: {}, hostMs: 0, hostMax: 0, cliMs: 0, cliMax: 0, ticks: 0, relB: 0 };
  const reset = () => Object.assign(win, { snapN: 0, snapB: 0, snapMax: 0, evN: 0, evB: 0, evMax: 0, kinds: {}, hostMs: 0, hostMax: 0, cliMs: 0, cliMax: 0, ticks: 0, relB: 0 });
  const origB = hostT.broadcast.bind(hostT);
  hostT.broadcast = (ch, data) => {
    if (typeof data === 'string') {
      win.evN++;
      win.evB += data.length;
      win.evMax = Math.max(win.evMax, data.length);
      try {
        const m = JSON.parse(data);
        if (m.t === 'events') for (const e of m.list) win.kinds[e.t] = (win.kinds[e.t] ?? 0) + 1;
      } catch {}
    } else {
      const n = data.byteLength;
      win.snapN++;
      win.snapB += n;
      win.snapMax = Math.max(win.snapMax, n);
    }
    return origB(ch, data);
  };
  const origS = hostT.send.bind(hostT);
  hostT.send = (peer, ch, data) => {
    win.relB += typeof data === 'string' ? data.length : data.byteLength;
    return origS(peer, ch, data);
  };
  const code = await hostT.host();
  const host = new HostSession({ mode: MODES.survival, seed: Number(process.argv[3] ?? 42), transport: hostT, roomCode: code });
  let client = null;
  const tick = async () => {
    let t = performance.now();
    host.advance(1000 / 30, () => {});
    let d = performance.now() - t;
    win.hostMs += d;
    win.hostMax = Math.max(win.hostMax, d);
    t = performance.now();
    client?.advance(1000 / 30, () => {});
    d = performance.now() - t;
    win.cliMs += d;
    win.cliMax = Math.max(win.cliMax, d);
    win.ticks++;
    hub.pump();
    await new Promise((r) => setImmediate(r));
  };
  const clientT = hub.createTransport();
  ClientSession.connect(clientT, code).then((c) => (client = c));
  for (let i = 0; i < 30 && !client; i++) await tick();

  const hs = host.sim;
  let ang = 0;
  let next = 10;
  const STRESS = process.env.STRESS; // ex. "5:4" : une vague niveau 5, configuration 4, toutes les 3 s
  let stressT = 0;
  let frozenMax = 0;
  console.log('   t  aliens proj flaq gel | snap moy/max (o)  evt/s  evt moy/max (o) | hôte moy/max ms  client moy/max ms | top événements');
  while (hs.time < SECONDS) {
    // les deux squads tournent lentement, immortelles (on veut la charge de toute la timeline)
    ang += 0.01;
    host.setLocalInput(Math.cos(ang), Math.sin(ang));
    client.setLocalInput(-Math.cos(ang), -Math.sin(ang));
    const want = Number(process.argv[4] ?? 0);
    for (const q of hs.squads) {
      while (want && q.soldiers.length < want) q.recruit(['trooper', 'trooper', 'sniper', 'medic'][q.soldiers.length % 4] ?? 'trooper', { x: q.center.x, y: q.center.y });
      for (const s of q.soldiers) s.hp = s.maxHp;
    }
    await tick();
    if (STRESS && (stressT -= 1 / 30) <= 0) {
      stressT = 3;
      const [lv, cf] = STRESS.split(':').map(Number);
      hs.waves.trigger(lv, cf);
    }
    frozenMax = Math.max(frozenMax, hs.squads.reduce((n, q) => n + q.soldiers.filter((s) => s.frozen > 0).length, 0));
    if (hs.time >= next) {
      next += 10;
      const proj = hs.combat.projectiles.active?.length ?? hs.combat.projectiles.size ?? '?';
      const frozen = frozenMax;
      frozenMax = 0;
      const top = Object.entries(win.kinds).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(' ');
      const secs = win.ticks / 30;
      console.log(
        `${hs.time.toFixed(0).padStart(4)}  ${String(hs.aliens.length).padStart(5)} ${String(proj).padStart(4)} ${String(hs.puddles.length).padStart(4)} ${String(frozen).padStart(3)} | ` +
          `${(win.snapB / Math.max(1, win.snapN)).toFixed(0).padStart(6)} / ${String(win.snapMax).padStart(6)}  ${(win.evN / secs).toFixed(0).padStart(5)}  ${(win.evB / Math.max(1, win.evN)).toFixed(0).padStart(6)} / ${String(win.evMax).padStart(6)} | ` +
          `${(win.hostMs / win.ticks).toFixed(2).padStart(6)} / ${win.hostMax.toFixed(1).padStart(5)}   ${(win.cliMs / win.ticks).toFixed(2).padStart(6)} / ${win.cliMax.toFixed(1).padStart(5)} | ${top}`,
      );
      if (process.env.SIZES) {
        const sizes = {};
        encodeSnapshot(takeSnapshot(hs, new Map()), sizes);
        const sold = hs.squads.reduce((n, q) => n + q.soldiers.length, 0);
        console.log('       ', Object.entries(sizes).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(' '), `(soldats ${sold}, aliens ${hs.aliens.length}, globes ${hs.xp.orbs.length})`);
      }
      reset();
    }
  }
} finally {
  await vite.close();
}
