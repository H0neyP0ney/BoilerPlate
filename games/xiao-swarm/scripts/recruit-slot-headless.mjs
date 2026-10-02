// Mesure où une recrue se place dans la formation : elle est ramassée à un endroit précis de la squad
// (devant, derrière, à gauche…) ; sa place doit être proche de cet endroit, sans que les autres soldats
// changent trop de place. Usage : node scripts/recruit-slot-headless.mjs [taille_squad]
import { createServer } from 'vite';

const size = Number(process.argv[2] ?? 8);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { Sim } = await vite.ssrLoadModule('/src/sim/Sim.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const dt = 1 / 30;

  function trial(angleDeg, moving) {
    const sim = new Sim({ mode: { ...MODES.survival, waves: [] }, seed: 9, players: ['p'] });
    sim.arena.obstacles.length = 0;
    const sq = sim.squads[0];
    sq.spawn(Array(size).fill('trooper'), { x: 1200, y: 900 });
    const inputs = new Map();
    inputs.set('p', moving ? { mx: 1, my: 0 } : { mx: 0, my: 0 });
    for (let i = 0; i < 90; i++) sim.step(dt, inputs);

    // Point de ramassage : à 30 px du soldat le plus éloigné du coeur dans la direction demandée.
    const a = (angleDeg * Math.PI) / 180;
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    let edge = sq.soldiers[0];
    for (const s of sq.soldiers) if ((s.x - sq.center.x) * dir.x + (s.y - sq.center.y) * dir.y > (edge.x - sq.center.x) * dir.x + (edge.y - sq.center.y) * dir.y) edge = s;
    const at = { x: edge.x + dir.x * 30, y: edge.y + dir.y * 30 };

    const before = new Map(sq.soldiers.map((s) => [s, { x: s.slotX, y: s.slotY }]));
    const added = typeof sq.recruit === 'function' ? sq.recruit('trooper', at) : sq.add('trooper', at);
    sim.step(dt, inputs); // déclenche la réattribution des places

    const relX = added.x - sq.anchor.x;
    const relY = added.y - sq.anchor.y;
    const slotErr = Math.hypot(added.slotX - relX, added.slotY - relY);
    let moved = 0;
    let maxShift = 0;
    for (const [s, old] of before) {
      const d = Math.hypot(s.slotX - old.x, s.slotY - old.y);
      if (d > 1) moved++;
      maxShift = Math.max(maxShift, d);
    }
    return { slotErr, moved, maxShift };
  }

  for (const moving of [false, true]) {
    let sumErr = 0, sumMoved = 0, worstErr = 0, worstShift = 0;
    const angles = Array.from({ length: 12 }, (_, i) => i * 30);
    for (const ang of angles) {
      const r = trial(ang, moving);
      sumErr += r.slotErr;
      sumMoved += r.moved;
      worstErr = Math.max(worstErr, r.slotErr);
      worstShift = Math.max(worstShift, r.maxShift);
    }
    const n = angles.length;
    console.log(
      `${moving ? 'en marche ' : "à l'arrêt  "} squad de ${size} : écart place ↔ point de ramassage moy ${(sumErr / n).toFixed(0)} px (max ${worstErr.toFixed(0)}) · ` +
        `soldats qui changent de place : ${(sumMoved / n).toFixed(1)} en moy · déplacement de place max ${worstShift.toFixed(0)} px`,
    );
  }
} finally {
  await vite.close();
}
