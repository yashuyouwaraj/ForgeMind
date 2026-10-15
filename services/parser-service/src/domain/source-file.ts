export type LanguageId = string;

export interface SourceFileMetadata {
  /**
   * Repository-relative path using forward slashes.
   * Absolute filesystem paths must never leave the discovery boundary.
   */
  readonly path: string;
  readonly extension: string;
  readonly languageId: LanguageId;
  readonly sizeBytes: number;
}

export type SourceDiscoverySkipReason =
  | "excluded-directory"
  | "too-deep"
  | "unsafe-path"
  | "symlink"
  | "not-regular-file"
  | "file-too-large"
  | "total-size-limit"
  | "file-count-limit"
  | "binary-content"
  | "file-unavailable";

export interface SourceDiscoveryResult {
  readonly files: readonly SourceFileMetadata[];
  readonly totalBytes: number;
  readonly skippedCounts: Readonly<
    Record<SourceDiscoverySkipReason, number>
  >;
  readonly truncated: boolean;
}