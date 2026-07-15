export interface MetadataSearchResult {
  source: string;
  externalId: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
  description: string | null;
}

export interface MetadataDetail {
  source: string;
  externalId: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
  attributes: Record<string, unknown>;
}
