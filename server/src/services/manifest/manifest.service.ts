import { CustomManifest } from './types';
import { ConfigService } from '../config';
import { DeviceTokenService } from '../device-token';
import { UserService } from '../user';
import type { ContentType, ShortManifestResource } from 'stremio-addon-sdk';

export class ManifestService {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
    private deviceTokenService: DeviceTokenService,
    private features: { subtitles: boolean; catalog: boolean } = {
      subtitles: false,
      catalog: false,
    },
  ) {}

  public getBaseManifest() {
    const config = this.configService.getConfig();
    const resources: string[] = ['stream'];
    if (this.features.subtitles) resources.push('subtitles');
    if (this.features.catalog) resources.push('catalog');

    const catalogs = this.features.catalog
      ? [
          { type: 'movie' as ContentType, id: 'ncore-popular-hu', name: 'nCore Népszerű Magyar Filmek' },
          { type: 'series' as ContentType, id: 'ncore-popular-hu', name: 'nCore Népszerű Magyar Sorozatok' },
        ]
      : [];

    return {
      id: 'local.ncore',
      behaviorHints: {
        adult: false,
        configurable: true,
        configurationRequired: true,
      },
      baseUrl: config.addonUrl,
      version: '0.8.0',
      name: 'nCore',
      description: 'Provides streams from a personal nCore account.',
      catalogs,
      resources: resources as ShortManifestResource[],
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
      logo: `${config.addonUrl}/stremio-ncore-addon-logo-rounded.png`,
    } satisfies CustomManifest;
  }

  public async getAuthenticatedManifest(deviceToken: string) {
    const [user, deviceTokenDetails] = await Promise.all([
      this.userService.getUserByDeviceTokenOrThrow(deviceToken),
      this.deviceTokenService.getDeviceTokenDetails(deviceToken),
    ]);
    const baseManifest = this.getBaseManifest();
    return {
      ...baseManifest,
      description: `Provides streams from a personal nCore account.\nLogged in as ${user.username}.\nDevice name: ${deviceTokenDetails.name}`,
      behaviorHints: {
        ...baseManifest.behaviorHints,
        configurationRequired: false,
        configurable: false,
      },
    } as const satisfies CustomManifest;
  }
}
