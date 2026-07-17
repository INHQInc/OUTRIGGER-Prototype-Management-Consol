// Core types for the capture pipeline

export interface CaptureConfig {
  /** Site key, e.g. "outrigger" | "hvc" */
  siteKey: string;
  /** Origin of the site being captured, e.g. "https://www.outrigger.com" */
  origin: string;
  /** Additional first-party hosts whose assets we download (CDNs etc.) */
  assetHosts: string[];
}

export interface RemovedScript {
  reason: string;
  /** "external" | "inline" | "noscript" | "link" | "attribute" */
  kind: string;
  /** src for external, first 200 chars for inline */
  detail: string;
}

export interface SanitizationReport {
  url: string;
  capturedAt: string;
  removed: RemovedScript[];
  blockedDomains: string[];
  notes: string[];
}

export interface AssetRecord {
  originalUrl: string;
  /** sha1 of content */
  hash: string;
  /** local filename: <hash>.<ext> */
  file: string;
  contentType: string;
  bytes: number;
  /** where it was referenced from: "html" | "css" | "srcset" */
  via: string;
}

export interface PageVersionMeta {
  url: string;
  siteKey: string;
  pageSlug: string;
  version: string; // ISO timestamp id
  capturedAt: string;
  htmlBytes: number;
  assetCount: number;
  assetBytes: number;
  assets: AssetRecord[];
  report: SanitizationReport;
}
