import type { Context } from 'hono';
import type { CatalogService } from '@/services/catalog';

export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  /**
   * Stremio catalog resource endpoint.
   * Route: GET /auth/:deviceToken/catalog/:type/:id.json
   * Returns Stremio MetaPreview objects (id + type is enough for Stremio to enrich via Cinemeta).
   */
  public async getCatalog(c: Context) {
    const type = c.req.param('type') as 'movie' | 'series';
    const metas = await this.catalogService.getCatalog(type);
    return c.json({ metas });
  }
}
