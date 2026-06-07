import parseTorrent from 'parse-torrent';
import contentDisposition from 'content-disposition';
import type { ParsedTorrentDetails } from './types';
import { writeFileWithCreateDir } from '@/utils/files';
import { env } from '@/env';
import { Cached, DEFAULT_TTL } from '@/utils/cache';

export class TorrentService {
  @Cached({
    max: 1_000,
    ttl: DEFAULT_TTL,
    ttlAutopurge: true,
    generateKey: (torrentUrl) => torrentUrl,
  })
  public async downloadAndParseTorrent(
    torrentUrl: string,
    init?: RequestInit,
  ): Promise<ParsedTorrentDetails> {
    const headers = new Headers(init?.headers);
    headers.set('accept', 'application/x-bittorrent,*/*;q=0.9');
    const torrentResponse = await fetch(torrentUrl, {
      redirect: 'follow',
      ...init,
      headers,
    });

    if (!torrentResponse.ok) {
      throw new Error(
        `Failed to download torrent. Status=${torrentResponse.status} ${torrentResponse.statusText}. Url=${torrentUrl}`,
      );
    }

    const contentType = torrentResponse.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      // Common failure mode: auth-required endpoints returning login pages.
      const snippet = (await torrentResponse.text()).slice(0, 300);
      throw new Error(
        `Expected a .torrent file but received HTML. Url=${torrentUrl}. Body starts with: ${JSON.stringify(snippet)}`,
      );
    }

    const buffer = await torrentResponse.arrayBuffer();
    let torrentData: Awaited<ReturnType<typeof parseTorrent>>;
    try {
      torrentData = await parseTorrent(new Uint8Array(buffer));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse torrent data from ${torrentUrl}: ${message}`);
    }

    type TorrentFile = { name: string; length: number; offset: number; path: string };
    return {
      infoHash: torrentData.infoHash,
      files:
        (torrentData.files as TorrentFile[] | undefined)?.map((file) => ({
          name: file.name,
          length: file.length,
          offset: file.offset,
          path: file.path,
        })) ?? [],
    };
  }

  /**
   * @returns the path to the downloaded torrent file
   */
  public async downloadTorrentFile(
    torrentUrl: string,
    init?: RequestInit,
  ): Promise<string> {
    const headers = new Headers(init?.headers);
    headers.set('accept', 'application/x-bittorrent,*/*;q=0.9');
    const torrentReq = await fetch(torrentUrl, {
      redirect: 'follow',
      ...init,
      headers,
    });

    if (!torrentReq.ok) {
      throw new Error(
        `Failed to download torrent file. Status=${torrentReq.status} ${torrentReq.statusText}. Url=${torrentUrl}`,
      );
    }

    const torrentArrayBuffer = await torrentReq.arrayBuffer();
    const parsedTorrent = await parseTorrent(new Uint8Array(torrentArrayBuffer));
    // torrent file name without the .torrent extension
    const torrentFileName = contentDisposition
      .parse(torrentReq.headers.get('content-disposition') ?? '')
      .parameters.filename?.replace(/\.torrent$/i, '');

    const torrentFilePath = `${env.TORRENTS_DIR}/${torrentFileName}-${parsedTorrent.infoHash}.torrent`;

    writeFileWithCreateDir(torrentFilePath, Buffer.from(torrentArrayBuffer));
    return torrentFilePath;
  }
}
