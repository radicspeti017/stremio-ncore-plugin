import { HttpStatusCode } from '@/types/http';
import { AddTorrentRequest, InfoHash, TorrentResponse } from './types';
import { rm } from 'fs/promises';

const TORRENT_SERVER_TIMEOUT_MS = 15_000;

export class TorrentServerSdk {
  private torrentFilePaths = new Map<InfoHash, string>();
  constructor(private readonly url: string) {}

  private async fetchWithTimeout(
    input: string,
    init?: RequestInit,
  ): Promise<Response> {
    return fetch(input, {
      ...init,
      signal: AbortSignal.timeout(TORRENT_SERVER_TIMEOUT_MS),
    });
  }

  private async fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchWithTimeout(input, init);
    } catch (firstError) {
      // A small single retry helps with occasional local socket hiccups.
      try {
        return await this.fetchWithTimeout(input, init);
      } catch {
        throw firstError;
      }
    }
  }

  public async getTorrent(infoHash: InfoHash): Promise<TorrentResponse | null> {
    const req = await this.fetchWithRetry(`${this.url}/torrents/${infoHash}`);
    if (!req.ok) {
      if (req.status === HttpStatusCode.NOT_FOUND) {
        return null;
      }
      const responseText = await req.text();
      throw Error(
        `Could not find torrent. Status code: ${req.status}. Error: ${responseText}`,
      );
    }
    return (await req.json()) as TorrentResponse;
  }

  public async getAllTorrents(): Promise<TorrentResponse[]> {
    const req = await this.fetchWithRetry(`${this.url}/torrents`);
    if (!req.ok) {
      const responseText = await req.text();
      throw Error(
        `Failed to get torrents. Status code: ${req.status}. Error: ${responseText}`,
      );
    }
    return (await req.json()) as TorrentResponse[];
  }

  public async addTorrent(torrentFilePath: string): Promise<TorrentResponse> {
    const req = await this.fetchWithTimeout(`${this.url}/torrents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: torrentFilePath } satisfies AddTorrentRequest),
    });
    if (!req.ok) {
      const responseText = await req.text();
      throw Error(
        `Could not add torrent. Status code: ${req.status}. Error: ${responseText}`,
      );
    }
    const torrent = (await req.json()) as TorrentResponse;
    this.torrentFilePaths.set(torrent.infoHash, torrentFilePath);
    return torrent;
  }

  public async deleteTorrent(infoHash: InfoHash): Promise<void> {
    const req = await this.fetchWithTimeout(`${this.url}/torrents/${infoHash}`, {
      method: 'DELETE',
    });
    if (!req.ok) {
      const responseText = await req.text();
      throw Error(
        `Could not delete torrent. Status code: ${req.status}. Error: ${responseText}`,
      );
    }
    const torrentFilePath = this.torrentFilePaths.get(infoHash);
    if (!torrentFilePath) {
      // Torrent was deleted from the torrent server, but we don't know where its .torrent file
      // is on disk (e.g. after a restart or if it was added outside of this process).
      console.warn(
        `Deleted torrent ${infoHash} from server, but no local torrent file path was recorded. Skipping file removal.`,
      );
      return;
    }
    try {
      await rm(torrentFilePath);
      this.torrentFilePaths.delete(infoHash);
    } catch (e) {
      throw Error(
        `Failed to delete torrent file at path: "${torrentFilePath}". Error: "${e}"`,
      );
    }
  }

  public getFileStreamingUrl(infoHash: InfoHash, filePath: string): string {
    return `${this.url}/torrents/${infoHash}/files/${filePath}`;
  }
}
