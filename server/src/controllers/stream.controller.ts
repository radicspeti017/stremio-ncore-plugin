import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamQuerySchema } from '@/schemas/stream.schema';
import type { TorrentService } from '@/services/torrent';
import type { StreamService } from '@/services/stream';
import type { UserService } from '@/services/user';
import type { TorrentStoreService } from '@/services/torrent-store';
import { playSchema } from '@/schemas/play.schema';
import { proxy } from 'hono/proxy';
import { HttpStatusCode } from '@/types/http';
import type { TorrentSourceManager } from '@/services/torrent-source';
import type { DeviceTokenService } from '@/services/device-token';

export class StreamController {
  constructor(
    private torrentSource: TorrentSourceManager,
    private torrentService: TorrentService,
    private streamService: StreamService,
    private userService: UserService,
    private torrentStoreService: TorrentStoreService,
    private deviceTokenService: DeviceTokenService,
  ) {}

  public async getStreamsForMedia(c: Context) {
    const params = c.req.param();
    const result = streamQuerySchema.safeParse(params);
    if (!result.success) {
      throw new HTTPException(HttpStatusCode.BAD_REQUEST, {
        message: result.error.message,
      });
    }
    const { imdbId, type, episode, season, deviceToken } = result.data;

    const user = await this.userService.getUserByDeviceTokenOrThrow(deviceToken);

  const deviceTokenDetails = await this.deviceTokenService.getDeviceTokenDetails(deviceToken);
  const effectiveLanguage = deviceTokenDetails?.preferredLanguage ?? user.preferredLanguage;

    const torrents = await this.torrentSource.getTorrentsForImdbId({
      imdbId,
      type,
      season,
      episode,
    });

    const orderedTorrents = await this.streamService.orderTorrents({
      torrents,
      season,
      episode,
      user,
    });

    const streams = orderedTorrents.map((torrent, i) =>
      this.streamService.convertTorrentToStream({
        torrent,
        isRecommended: i === 0,
        deviceToken,
        season,
        episode,
        preferredLanguage: effectiveLanguage,
      }),
    );

    return c.json({ streams });
  }

  public async play(c: Context) {
    const params = c.req.param();
    const result = playSchema.safeParse(params);
    if (!result.success) {
      throw new HTTPException(HttpStatusCode.BAD_REQUEST, {
        message: result.error.message,
      });
    }
    const { sourceName, sourceId, infoHash, fileIdx } = result.data;

    let torrent;
    try {
      torrent = await this.torrentStoreService.getTorrent(infoHash);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Failed to query torrent store for ${infoHash}: ${message}`);
      throw new HTTPException(HttpStatusCode.SERVICE_UNAVAILABLE, {
        message: 'Torrent store is temporarily unavailable. Please try again.',
      });
    }

    if (!torrent) {
      const torrentUrl = await this.torrentSource.getTorrentUrlBySourceId({
        sourceId,
        sourceName,
      });
      if (!torrentUrl) {
        throw new HTTPException(HttpStatusCode.NOT_FOUND, {
          message: 'Torrent not found',
        });
      }
      const torrentFilePath = await this.torrentService.downloadTorrentFile(torrentUrl);
      torrent = await this.torrentStoreService.addTorrent(torrentFilePath);
    }
    const file = torrent.files[Number(fileIdx)]!;

    return proxy(
      this.torrentStoreService.getFileStreamingUrl({
        infoHash: torrent.infoHash,
        filePath: file.path,
      }),
      { headers: { ...c.req.header() } },
    );
  }
}
