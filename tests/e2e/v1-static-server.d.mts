export interface ReadOnlyV1ServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
}

export function hasStarlightV1Repo(rootDir?: string): boolean;
export function getStarlightV1Dir(): string;
export function startReadOnlyV1Server(rootDir?: string): Promise<ReadOnlyV1ServerHandle>;
