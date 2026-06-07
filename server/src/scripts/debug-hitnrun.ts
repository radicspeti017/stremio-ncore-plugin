import { env } from '@/env';
import { TorrentService } from '@/services/torrent/torrent.service';
import { NcoreService } from '@/services/torrent-source/ncore/ncore.service';
import { CinemeatService } from '@/services/cinemeta';

async function main() {
  // Do not log secrets. Only log high-level status.
  console.log('[debug-hitnrun] Starting…');
  console.log('[debug-hitnrun] Using nCore url:', env.NCORE_URL);
  console.log('[debug-hitnrun] Username length:', env.NCORE_USERNAME.length);
  console.log('[debug-hitnrun] NCORE_COOKIE provided:', Boolean(env.NCORE_COOKIE));
  if (env.NCORE_COOKIE) {
    console.log('[debug-hitnrun] NCORE_COOKIE length:', env.NCORE_COOKIE.length);
  }

  try {
    const loginResp = await fetch(`${env.NCORE_URL}/login.php`, {
      redirect: 'manual',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const ct = loginResp.headers.get('content-type') ?? '';
    const body = await loginResp.text();
    console.log('[debug-hitnrun] login.php status:', loginResp.status);
    console.log('[debug-hitnrun] login.php content-type:', ct);
    console.log('[debug-hitnrun] login.php has name="nev":', body.includes('name="nev"'));
    console.log('[debug-hitnrun] login.php has name="pass":', body.includes('name="pass"'));
    console.log('[debug-hitnrun] login.php looks like cloudflare:', body.toLowerCase().includes('cloudflare'));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('[debug-hitnrun] login.php precheck failed:', msg);
  }

  const torrentService = new TorrentService();

  // NcoreService requires a cinemeta service instance. (hit'n'run parsing doesn't use it,
  // but we keep wiring consistent to avoid `any`.)
  const cinemetaService = new CinemeatService();

  const ncore = new NcoreService(
    torrentService,
    cinemetaService,
    env.NCORE_URL,
    env.NCORE_USERNAME,
    env.NCORE_PASSWORD,
    env.NCORE_COOKIE,
  );

  const startedAt = Date.now();
  try {
    const infoHashes = await ncore.getRemovableInfoHashes();
    const elapsedMs = Date.now() - startedAt;

    console.log('[debug-hitnrun] Removable infohash count:', infoHashes.length);
    console.log('[debug-hitnrun] Elapsed ms:', elapsedMs);

    const preview = infoHashes.slice(0, 10).map((h) => h.slice(0, 12));
    console.log('[debug-hitnrun] First hashes (prefixes):', preview);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[debug-hitnrun] FAILED:', message);
    process.exitCode = 1;
  }
}

main();
