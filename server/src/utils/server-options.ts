import { LOCAL_IP_HOSTNAME, LOCAL_IP_KEYS_URL } from '@/constants/local-ip';
import { ServerOptions } from 'node:https';
import { createSecureContext } from 'node:tls';
import { z } from 'zod';

const ONE_HOUR = 60 * 60 * 1000;

const localIpResponseSchema = z.object({
  privkey: z.string(),
  cert: z.string(),
  chain: z.string(),
  fullchain: z.string(),
});

type LocalIpResponse = z.infer<typeof localIpResponseSchema>;

const fetchLocalIpKeys = async () => {
  console.log('Fetching local-ip keys');
  const req = await fetch(LOCAL_IP_KEYS_URL);
  const json = await req.json();
  const parseResult = localIpResponseSchema.safeParse(json);
  if (!parseResult.success) {
    throw new Error(`Failed to parse local IP keys: ${parseResult.error}`);
  }
  console.log('Found local-ip keys');
  return parseResult.data;
};

export const createServerOptions = async (): Promise<ServerOptions> => {
  let localIpDetails: LocalIpResponse | null = null;

  const refreshKeys = async () => {
    try {
      localIpDetails = await fetchLocalIpKeys();
    } catch (error) {
      // Do not crash the whole process if DNS/network is temporarily unavailable.
      // HTTPS for local-ip.* will simply be unavailable until a refresh succeeds.
      console.error('Failed to fetch local IP keys:', error);
    }
  };

  // Try once during startup, but tolerate failure.
  await refreshKeys();

  // Keep trying periodically in the background.
  setInterval(() => {
    void refreshKeys();
  }, ONE_HOUR);

  return {
    SNICallback: (serverName, cb) => {
      if (serverName.includes(LOCAL_IP_HOSTNAME) && localIpDetails) {
        const ctx = createSecureContext({
          key: localIpDetails.privkey,
          cert: `${localIpDetails.cert}\n${localIpDetails.chain}`,
        });
        cb(null, ctx);
        return;
      }
      cb(null, undefined);
    },
  };
};
