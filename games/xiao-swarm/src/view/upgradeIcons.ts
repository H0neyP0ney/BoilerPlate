import type { UpgradeId } from '../data/progression';

/**
 * Icône d'une upgrade (carte de choix, texte flottant, visionneuse) : `public/assets/ui/upgrades/<id>.png`, découpée de
 * `art-src/icon_upgrade.png` par `node tools/slice-upgrade-icons.mjs` et déclarée dans `assets/manifest.ts`.
 */
export const upgradeIconKey = (id: UpgradeId): string => `upgrade_icon_${id}`;
