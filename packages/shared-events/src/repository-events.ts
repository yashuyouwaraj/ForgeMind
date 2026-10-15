/**
 * Shared, transport-independent event contracts.
 *
 * Events are immutable facts about completed domain actions.
 * Transport adapters are responsible for serialization and delivery.
 */

export interface DomainEvent<TType extends string, TData> {
  readonly eventId: string;
  readonly eventType: TType;
  readonly eventVersion: 1;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly data: Readonly<TData>;
}

export interface RepositoryImportedData {
  readonly repositoryId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly provider: string;
  readonly url: string;
  readonly defaultBranch: string | null;
}

export type RepositoryImportedEvent = DomainEvent<
  "RepositoryImported",
  RepositoryImportedData
>;

export interface RepositorySynchronizedData {
  readonly repositoryId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly remoteUrl: string;
  readonly defaultBranch: string | null;
  readonly headCommit: string | null;
  readonly synchronizedAt: string;
}

export type RepositorySynchronizedEvent = DomainEvent<
  "RepositorySynchronized",
  RepositorySynchronizedData
>;

export interface RepositorySyncFailedData {
  readonly repositoryId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly failureCode: string;
  readonly retryable: boolean;
}

export type RepositorySyncFailedEvent = DomainEvent<
  "RepositorySyncFailed",
  RepositorySyncFailedData
>;


export interface RepositoryParseRequestedData {
  readonly repositoryId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly headCommit: string;
  readonly requestedAt: string;
}

export type RepositoryParseRequestedEvent = DomainEvent<
  "RepositoryParseRequested",
  RepositoryParseRequestedData
>;

export interface RepositoryParseFailedData {
  readonly repositoryId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly headCommit: string;
  readonly failureCode: string;
  readonly retryable: boolean;
}

export type RepositoryParseFailedEvent = DomainEvent<
  "RepositoryParseFailed",
  RepositoryParseFailedData
>;



export type RepositoryEvent =
  | RepositoryImportedEvent
  | RepositorySynchronizedEvent
  | RepositorySyncFailedEvent
  | RepositoryParseRequestedEvent
  | RepositoryParseFailedEvent;
