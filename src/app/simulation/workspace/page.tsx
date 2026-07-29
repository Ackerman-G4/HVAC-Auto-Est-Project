import { redirect } from 'next/navigation';

/**
 * The workspace view was a simplified duplicate of /simulation/viewer -- its
 * config, 3D and results panels all had equivalents there, and its two unique
 * capabilities (engineering report export, runtime/dimension solver controls)
 * were ported into the viewer. Kept as a redirect so existing bookmarks and
 * links keep working.
 */
export default function SimulationWorkspacePage() {
  redirect('/simulation/viewer');
}
