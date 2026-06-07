import type { TorrentSourceManager } from '@/services/torrent-source';

export class CatalogService {
  constructor(private torrentSource: TorrentSourceManager) {}

  public async getCatalog(
    type: 'movie' | 'series',
  ): Promise<Array<{ id: string; type: string }>> {
    return this.torrentSource.getPopularItems(type);
  }
}
