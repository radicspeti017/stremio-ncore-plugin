export interface OpenSubtitlesSubtitleFile {
  file_id: number;
  cd_number: number;
  file_name: string;
}

export interface OpenSubtitlesSubtitle {
  id: string;
  attributes: {
    language: string;
    release: string;
    files: OpenSubtitlesSubtitleFile[];
  };
}

export interface OpenSubtitlesSearchResponse {
  data: OpenSubtitlesSubtitle[];
}

export interface OpenSubtitlesLoginResponse {
  token: string;
  status: number;
}

export interface OpenSubtitlesDownloadResponse {
  link: string;
  file_name: string;
  remaining: number;
}

export interface StremioSubtitle {
  id: string;
  url: string;
  lang: string;
}
