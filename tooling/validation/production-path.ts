/**
 * What counts as a production file for browser-journey selection. The affected
 * plan and the journey-map guard share it, so a mapping the plan could never
 * select fails the guard.
 */
export function isProductionSourcePath({
  changedPath,
}: {
  changedPath: string;
}): boolean {
  const isWeb = changedPath.startsWith('apps/web/');
  if (!isWeb && !changedPath.startsWith('apps/server/')) return false;
  // The web page itself and its stylesheets ship too: index.html paints the
  // boot shell, and the CSS lays out every page.
  const isWebPage =
    isWeb &&
    (changedPath === 'apps/web/index.html' ||
      /^apps\/web\/src\/.+\.css$/.test(changedPath));
  if (!/\.tsx?$/.test(changedPath) && !isWebPage) return false;
  if (changedPath.includes('.test.')) return false;
  if (changedPath.includes('/tests/')) return false;

  return true;
}
