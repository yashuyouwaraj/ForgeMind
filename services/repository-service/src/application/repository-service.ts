
import { NotFoundError } from "@forgemind/shared-errors";
import type { RegisterRepositoryInput } from "../domain/repository/repository-types.js";
import type { RepositoryRepository } from "../repositories/repository-repository.js";
export class RepositoryService {
  constructor(
    private readonly repositoryRepository: RepositoryRepository,
  ) {}

  async registerRepository(input: RegisterRepositoryInput) {
    return this.repositoryRepository.create(input);
  }

  async getRepository(repositoryId: string) {
    const repository =
      await this.repositoryRepository.findById(repositoryId);

    if (!repository) {
      throw new NotFoundError("Repository not found");
    }

    return repository;
  }

  async listRepositories(
    projectId: string,
    pagination: { page: number; pageSize: number },
  ) {
    return this.repositoryRepository.findByProjectId(
      projectId,
      pagination.page,
      pagination.pageSize,
    );
  }
}
