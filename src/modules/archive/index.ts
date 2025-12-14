/* -------------------------------------------------------------------------- */
/* Public APIs                                                                */
/* -------------------------------------------------------------------------- */
/**
 *  Note: Since this API bundles jszip, the final js file ends up being 120KB+
 */

import { Archive, downloadArchives } from '$lib/archive';

window.Archive = Archive;
window.downloadArchives = downloadArchives;
