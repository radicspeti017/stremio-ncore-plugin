import { Cached, DEFAULT_MAX } from '@/utils/cache';
import type {
  OpenSubtitlesDownloadResponse,
  OpenSubtitlesLoginResponse,
  OpenSubtitlesSearchResponse,
  StremioSubtitle,
} from './types';

/** 30 minutes – balances freshness vs. API rate limits */
const SUBTITLE_TTL = 1000 * 60 * 30;

export class SubtitleService {
  private readonly BASE_URL = 'https://api.opensubtitles.com/api/v1';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private apiKey: string,
    private username: string,
    private password: string,
    private addonUrl: string,
  ) {}

  private getHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Api-Key': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'stremio-ncore-addon v1',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async login(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }
    const resp = await fetch(`${this.BASE_URL}/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (!resp.ok) {
      throw new Error(`OpenSubtitles login failed: ${resp.status}`);
    }
    const data = (await resp.json()) as OpenSubtitlesLoginResponse;
    // Tokens are valid for 24h; cache for 23h to be safe
    this.tokenCache = { token: data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
    return data.token;
  }

  @Cached({
    max: DEFAULT_MAX,
    ttl: SUBTITLE_TTL,
    ttlAutopurge: true,
    generateKey: (imdbId: string, type: string, season?: number, episode?: number) =>
      `${imdbId}:${type}:${season ?? ''}:${episode ?? ''}`,
  })
  public async searchHuSubtitles(
    imdbId: string,
    type: string,
    season?: number,
    episode?: number,
  ): Promise<StremioSubtitle[]> {
    const cleanId = imdbId.replace('tt', '');
    const params = new URLSearchParams({
      imdb_id: cleanId,
      languages: 'hu',
      type: type === 'series' ? 'episode' : 'movie',
    });
    if (season !== undefined) params.set('season_number', String(season));
    if (episode !== undefined) params.set('episode_number', String(episode));

    const resp = await fetch(`${this.BASE_URL}/subtitles?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!resp.ok) {
      console.error('OpenSubtitles search failed:', resp.status, await resp.text());
      return [];
    }
    const data = (await resp.json()) as OpenSubtitlesSearchResponse;
    return data.data.slice(0, 5).flatMap((sub) =>
      sub.attributes.files.slice(0, 1).map((file) => ({
        id: String(file.file_id),
        url: `${this.addonUrl}/api/subtitle-proxy/${file.file_id}`,
        lang: 'hun',
      })),
    );
  }

  public async getDownloadLink(fileId: number): Promise<string> {
    const token = await this.login();
    const resp = await fetch(`${this.BASE_URL}/download`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({ file_id: fileId }),
    });
    if (!resp.ok) {
      throw new Error(`OpenSubtitles download request failed: ${resp.status}`);
    }
    const data = (await resp.json()) as OpenSubtitlesDownloadResponse;
    return data.link;
  }
}
