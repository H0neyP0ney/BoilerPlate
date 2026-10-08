import { poki, DEV_TOOLS } from '@xiao/engine';
import { BOT_LEVEL_IDS, MAX_BOTS, type BotLevel } from './data/bots';
import { MODES, type ModeDef } from './data/modes';
import { ClientSession } from './net/ClientSession';
import { HostSession } from './net/HostSession';
import type { Session } from './net/Session';
import type { Transport } from './net/Transport';
import { NetlibTransport } from './transport/NetlibTransport';

/**
 * Identifiant de jeu Netlib. Valeur de développement : à remplacer par l'id que Poki
 * fournit pour le jeu avant la mise en ligne (les salons sont séparés par jeu).
 */
const NETLIB_GAME_ID = '2a85d0ab-13ea-4151-a855-0d6f50854ac5';

/** Délai max pour créer / rejoindre une salle (ms). */
const CONNECT_TIMEOUT = 12_000;

/** Crée le transport réseau : point unique à changer pour utiliser une autre lib. */
const makeTransport = (): Transport => new NetlibTransport(NETLIB_GAME_ID);

export type OnlineRequest = { kind: 'host' } | { kind: 'join'; code: string } | { kind: 'auto' };

export class OnlineError extends Error {
  constructor(readonly reason: 'not-found' | 'full' | 'version' | 'timeout' | 'failed') {
    super(reason);
  }
}

/**
 * Paramètres d'URL (pas d'écran titre sur Poki) :
 *   ?net=host                 crée une salle (le code s'affiche dans le HUD)
 *   ?net=join&room=CODE       rejoint une salle (en cours de partie possible)
 *   ?net=auto                 rejoint une salle publique, sinon en crée une
 *   ?net=host&bot=2&botlevel=expert   (dev) l'hôte démarre avec 2 coéquipiers IA, niveau standard (défaut) ou expert
 */
export function readOnlineRequest(): OnlineRequest | null {
  const net = poki.getURLParam('net');
  const room = poki.getURLParam('room');
  if (net === 'host') return { kind: 'host' };
  if (net === 'auto') return { kind: 'auto' };
  if (net === 'join' || room) return room ? { kind: 'join', code: room } : null;
  return null;
}

export async function createOnlineSession(req: OnlineRequest, mode: ModeDef = MODES.survival): Promise<Session> {
  if (req.kind === 'host') return host(mode);
  if (req.kind === 'join') return join(req.code);
  const transport = makeTransport();
  const code = await withTimeout(transport.findRoom(), transport).catch(() => null);
  transport.close();
  return code ? join(code).catch(() => host(mode)) : host(mode);
}

/** Coéquipiers IA demandés par l'URL (?bot=N, ?botlevel=standard|expert) : seulement en dev, absents du build Poki. */
function readBots(): { bots: number; botLevel: BotLevel } {
  if (!DEV_TOOLS) return { bots: 0, botLevel: 'standard' };
  const n = Number(poki.getURLParam('bot'));
  const level = poki.getURLParam('botlevel');
  return {
    bots: Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_BOTS) : 0,
    botLevel: BOT_LEVEL_IDS.find((l) => l === level) ?? 'standard',
  };
}

async function host(mode: ModeDef): Promise<HostSession> {
  const transport = makeTransport();
  const { bots, botLevel } = readBots();
  const roomCode = await withTimeout(transport.host({ public: true }), transport);
  return new HostSession({ mode, seed: (Math.random() * 2 ** 31) | 0, transport, roomCode, bots, botLevel });
}

async function join(code: string): Promise<ClientSession> {
  const transport = makeTransport();
  try {
    return await withTimeout(ClientSession.connect(transport, code), transport);
  } catch (e) {
    transport.close();
    if (e instanceof OnlineError) throw e;
    const reason = (e as Error).message;
    throw new OnlineError(reason === 'not-found' || reason === 'full' || reason === 'version' ? reason : 'failed');
  }
}

function withTimeout<T>(promise: Promise<T>, transport: Transport): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      transport.close();
      reject(new OnlineError('timeout'));
    }, CONNECT_TIMEOUT);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
