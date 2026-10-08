/**
 * Outils de dev actifs (menus, panneaux, visionneuses…) : toujours en dev, et dans un build déployé seulement avec `?debug=1` dans
 * l'URL (tester en ligne sans les livrer aux joueurs). Ce qui a besoin du serveur Vite (Save vers le code) reste lié à `import.meta.env.DEV`.
 */
export const DEV_TOOLS: boolean = import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1');
