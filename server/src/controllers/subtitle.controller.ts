import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { HttpStatusCode } from '@/types/http';
import type { SubtitleService } from '@/services/subtitle';
import type { StreamType } from '@/schemas/stream.schema';

export class SubtitleController {
  constructor(private subtitleService: SubtitleService) {}

  /**
   * Stremio subtitles resource endpoint.
   * Route: GET /auth/:deviceToken/subtitles/:type/:id.json
   * The `id` for movies is `tt1234567.json`, for series `tt1234567:1:2.json`.
   */
  public async getSubtitles(c: Context) {
    const type = c.req.param('type') as StreamType;
    const rawId = c.req.param('id').replace(/\.json$/, '');

    let imdbId: string;
    let season: number | undefined;
    let episode: number | undefined;

    if (rawId.includes(':')) {
      const [id, s, e] = rawId.split(':') as [string, string, string];
      imdbId = id;
      season = Number(s);
      episode = Number(e);
    } else {
      imdbId = rawId;
    }

    const subtitles = await this.subtitleService.searchHuSubtitles(
      imdbId,
      type,
      season,
      episode,
    );
    return c.json({ subtitles });
  }

  /**
   * Proxy that resolves an OpenSubtitles file_id to a temporary download URL
   * and redirects the client. No auth needed since subtitle data is not sensitive.
   * Route: GET /subtitle-proxy/:fileId
   */
  public async proxySubtitle(c: Context) {
    const rawFileId = c.req.param('fileId');
    const fileId = Number(rawFileId);
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new HTTPException(HttpStatusCode.BAD_REQUEST, { message: 'Invalid file ID' });
    }
    try {
      const link = await this.subtitleService.getDownloadLink(fileId);
      return c.redirect(link, 302);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Subtitle proxy error:', msg);
      throw new HTTPException(HttpStatusCode.BAD_GATEWAY, {
        message: 'Failed to fetch subtitle download link',
      });
    }
  }
}
