import cookieParser from 'set-cookie-parser';
import { JSDOM } from 'jsdom';
import type { ParsedTorrentDetails, TorrentSource } from '../types';
import {
  NcoreOrderBy,
  NcoreSearchBy,
  type NcorePageResponseJson,
  type NcoreQueryParams,
} from './types';
import {
  BATCH_DELAY,
  BATCH_SIZE,
  MOVIE_CATEGORY_FILTERS,
  SERIES_CATEGORY_FILTERS,
} from './constants';
import { NcoreTorrentDetails } from './ncore-torrent-details';
import type { TorrentService } from '@/services/torrent';
import type { StreamQuery } from '@/schemas/stream.schema';
import { StreamType } from '@/schemas/stream.schema';
import { processInBatches } from '@/utils/process-in-batches';
import { CinemeatService } from '@/services/cinemeta';
import { isSupportedMedia } from '@/utils/media-file-extensions';
import { Cached, DEFAULT_MAX, DEFAULT_TTL } from '@/utils/cache';

export class NcoreService implements TorrentSource {
  public name = 'ncore';
  public displayName = 'nCore';

  constructor(
    private torrentService: TorrentService,
    private cinemetaService: CinemeatService,
    private ncoreUrl: string,
    private ncoreUsername: string,
    private ncorePassword: string,
    private ncoreCookie?: string,
  ) {}
  private cookiesCache = {
    pass: null as string | null,
    cookieExpirationDate: 0,
  };

  private getDefaultHeaders() {
    return {
      // Some sites behave differently without a browser-like UA.
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
  }

  private async assertCookiesAreAuthenticated(cookieHeader: string): Promise<void> {
    const resp = await fetch(`${this.ncoreUrl}/torrents.php`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        ...this.getDefaultHeaders(),
        cookie: cookieHeader,
      },
    });

    const location = resp.headers.get('location') ?? '';
    if (resp.status >= 300 && resp.status < 400 && location.includes('login.php')) {
      throw new Error('nCore auth check failed (redirected to login)');
    }
    if (resp.status === 403) {
      throw new Error('nCore auth check failed (403). Possible bot protection/captcha.');
    }
  }

  public async getCookies(username: string, password: string): Promise<string> {
    if (this.ncoreCookie) {
      await this.assertCookiesAreAuthenticated(this.ncoreCookie);
      return this.ncoreCookie;
    }
    if (
      this.cookiesCache.pass &&
      this.cookiesCache.cookieExpirationDate > Date.now() + 1000
    ) {
      return this.cookiesCache.pass;
    }
    const form = new URLSearchParams();
    form.set('set_lang', 'hu');
    form.set('submitted', '1');
    form.set('nev', username);
    form.set('pass', password);
    form.set('ne_leptessen_ki', '1');
    const resp = await fetch(`${this.ncoreUrl}/login.php`, {
      method: 'POST',
      body: form,
      redirect: 'manual',
      headers: {
        ...this.getDefaultHeaders(),
        // These help some WAF/bot-protection setups.
        origin: this.ncoreUrl,
        referer: `${this.ncoreUrl}/login.php`,
      },
    });
    const allCookies = cookieParser.parse(resp.headers.getSetCookie());
    if (allCookies.length === 0) {
      const location = resp.headers.get('location') ?? '';
      if (resp.status === 403) {
        throw new Error('Failed to log in to nCore (403). Possible bot protection/captcha.');
      }
      throw new Error(
        `Failed to log in to nCore. No cookies were set. Status=${resp.status}. Location=${location}`,
      );
    }

    const passCookie = allCookies.find(({ name }) => name === 'pass');
    if (passCookie?.value === 'deleted') {
      throw new Error('Failed to log in to nCore. pass cookie was deleted');
    }
    const fullCookieString = allCookies
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');

    // Some nCore variants may not use a `pass` cookie name anymore.
    // Validate the cookie set by doing an authenticated check.
    await this.assertCookiesAreAuthenticated(fullCookieString);

    this.cookiesCache.pass = fullCookieString;
    if (passCookie?.expires) {
      this.cookiesCache.cookieExpirationDate = passCookie.expires.getTime();
    } else {
      // Fallback: keep it short-lived so we re-login if needed.
      this.cookiesCache.cookieExpirationDate = Date.now() + 30 * 60 * 1000;
    }

    return fullCookieString;
  }

  public async getConfigIssues(): Promise<string | null> {
    try {
      await this.getCookies(this.ncoreUsername, this.ncorePassword);
      return null;
    } catch (error) {
      console.error('Failed to log in to nCore while checking nCore config', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('pass cookie was deleted')) {
        return 'Failed to log in to nCore (invalid username/password).';
      }
      if (msg.includes('bot protection') || msg.includes('captcha') || msg.includes('(403)')) {
        return 'Failed to log in to nCore (possible bot protection/captcha). Try again later or verify from the host network.';
      }
      return 'Failed to log in to nCore. Check your credentials in the environment variables.';
    }
  }

  private async fetchTorrents(query: URLSearchParams): Promise<NcorePageResponseJson> {
    const cookies = await this.getCookies(this.ncoreUsername, this.ncorePassword);
    const request = await fetch(`${this.ncoreUrl}/torrents.php?${query.toString()}`, {
      redirect: 'manual',
      headers: {
        ...this.getDefaultHeaders(),
        cookie: cookies,
      },
    });

    const location = request.headers.get('location') ?? '';
    if (
      request.status >= 300 &&
      request.status < 400 &&
      location.includes('login.php')
    ) {
      throw new Error('nCore request redirected to login (cookie expired/invalid)');
    }
    if (request.status === 403) {
      throw new Error('nCore request blocked (403). Possible bot protection/captcha.');
    }

    if (request.headers.get('content-type')?.includes('application/json')) {
      return (await request.json()) as NcorePageResponseJson;
    }
    // the API returns HTML if there are no results
    const html = await request.text();
    if (html.includes('login.php') || html.includes('name="nev"') || html.includes('name="pass"')) {
      throw new Error('nCore returned a login page instead of results (cookie expired/invalid)');
    }
    return {
      results: [],
      total_results: '0',
      onpage: 0,
      perpage: '0',
    } satisfies NcorePageResponseJson;
  }

  @Cached({
    max: DEFAULT_MAX,
    ttl: DEFAULT_TTL,
    ttlAutopurge: true,
    generateKey: (queryParams) => new URLSearchParams(queryParams).toString(),
  })
  private async getTorrentsForQuery(
    queryParams: NcoreQueryParams,
  ): Promise<NcoreTorrentDetails[]> {
    const baseParams = {
      ...queryParams,
      tipus: 'kivalasztottak_kozott',
      jsons: 'true',
    };

    // fetching the first page to get the last page number
    const firstPageQuery = new URLSearchParams({ ...baseParams, oldal: `1` });
    const firstPage = await this.fetchTorrents(firstPageQuery);
    const lastPage = Math.ceil(
      Number(firstPage.total_results) / Number(firstPage.perpage),
    );

    // fetching the rest of the pages
    const restPagePromises: Promise<NcorePageResponseJson>[] = [];
    for (let page = 2; page <= lastPage; page++) {
      const query = new URLSearchParams({ ...baseParams, oldal: `${page}` });
      restPagePromises.push(this.fetchTorrents(query));
    }
    const pages = [firstPage, ...(await Promise.all(restPagePromises))];
    const allNcoreTorrents = pages.flatMap((page) => page.results);

    const torrentsWithParsedData = await processInBatches(
      allNcoreTorrents,
      BATCH_SIZE,
      BATCH_DELAY,
      async (torrent) => {
        const parsedData = await this.torrentService.downloadAndParseTorrent(
          torrent.download_url,
        );
        return new NcoreTorrentDetails(torrent, parsedData);
      },
    );
    return torrentsWithParsedData;
  }

  private filterTorrentsBySeasonAndEpisode(
    torrents: NcoreTorrentDetails[],
    { season, episode }: { season?: number; episode?: number },
  ) {
    return torrents.filter((torrent) => {
      const file = torrent.files[torrent.getMediaFileIndex({ season, episode })];
      return file !== undefined && isSupportedMedia(file.path);
    });
  }

  public async getTorrentsForImdbId({
    imdbId,
    type,
    season,
    episode,
  }: Pick<StreamQuery, 'imdbId' | 'type' | 'season' | 'episode'>): Promise<
    NcoreTorrentDetails[]
  > {
    let torrents = await this.getTorrentsForQuery({
      mire: imdbId,
      miben: NcoreSearchBy.IMDB,
      miszerint: NcoreOrderBy.SEEDERS,
      kivalasztott_tipus:
        type === StreamType.MOVIE ? MOVIE_CATEGORY_FILTERS : SERIES_CATEGORY_FILTERS,
    });
    torrents = this.filterTorrentsBySeasonAndEpisode(torrents, { season, episode });

    if (torrents.length > 0) {
      return torrents;
    }
    let name = '';
    try {
      const cinemetaData = await this.cinemetaService.getMetadataByImdbId(type, imdbId);
      name = cinemetaData.meta.name;
    } catch (error) {
      console.error('Failed to get metadata from Cinemeta', error);
      return [];
    }
    torrents = await this.getTorrentsForQuery({
      mire: name,
      miben: NcoreSearchBy.NAME,
      miszerint: NcoreOrderBy.SEEDERS,
      kivalasztott_tipus:
        type === StreamType.MOVIE ? MOVIE_CATEGORY_FILTERS : SERIES_CATEGORY_FILTERS,
    });
    torrents.forEach((torrent) => {
      torrent.isSpeculated = true;
    });
    torrents = this.filterTorrentsBySeasonAndEpisode(torrents, { season, episode });

    return torrents;
  }

  public async getTorrentUrlBySourceId(ncoreId: string) {
    const cookies = await this.getCookies(this.ncoreUsername, this.ncorePassword);
    const response = await fetch(
      `${this.ncoreUrl}/torrents.php?action=details&id=${ncoreId}`,
      {
        headers: {
          cookie: cookies,
        },
      },
    );

    const html = await response.text();
    const { document } = new JSDOM(html).window;
    const downloadLink = `${this.ncoreUrl}/${document
      .querySelector('.download > a')
      ?.getAttribute('href')}`;
    return downloadLink;
  }

  public async getRemovableInfoHashes(): Promise<string[]> {
    const cookie = await this.getCookies(this.ncoreUsername, this.ncorePassword);
    const request = await fetch(`${this.ncoreUrl}/hitnrun.php?showall=true`, {
      headers: { cookie },
    });
    const html = await request.text();
    const { document } = new JSDOM(html).window;

    const rows = Array.from(document.querySelectorAll('.hnr_all, .hnr_all2'));
    const deletableRows = rows.filter(
      (row) => row.querySelector('.hnr_ttimespent')?.textContent === '-',
    );

    const deletableNcoreIds = deletableRows.map((row) => {
      const detailsUrl = row.querySelector('.hnr_tname a')?.getAttribute('href') ?? '';
      const searchParams = new URLSearchParams(detailsUrl.split('?')[1] ?? '');
      const ncoreId = searchParams.get('id') ?? '';
      return ncoreId;
    });

    const deletableTorrentPromises = deletableNcoreIds.map(async (ncoreId) => {
      const downloadUrl = await this.getTorrentUrlBySourceId(ncoreId);
      const torrent = await this.torrentService.downloadAndParseTorrent(downloadUrl);
      return torrent;
    });

    const deletableTorrents = (await Promise.allSettled(deletableTorrentPromises))
      .filter(
        (result): result is PromiseFulfilledResult<ParsedTorrentDetails> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);

    deletableTorrents.map((torrent) => {
      console.log(`Torrent "${torrent.infoHash}" can be deleted.`);
    });
    return deletableTorrents.map(({ infoHash }) => infoHash);
  }
}
