import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  NotFoundError,
} from "@forgemind/shared-errors";
import { ProjectMembershipService } from "./project-membership-service.js";
import type { ProjectMembershipRepository } from "../repositories/project-membership-repository.js";
import type { ProjectRepository } from "../repositories/project-repository.js";

const ownerId = "owner-1";
const memberId = "member-1";
const otherUserId = "user-2";
const projectId = "project-1";

const project = {
  id: projectId,
  name: "ForgeMind",
  description: "Software Intelligence Platform",
  ownerId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ownerMembership = {
  projectId,
  userId: ownerId,
  role: "OWNER" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const memberMembership = {
  projectId,
  userId: memberId,
  role: "DEVELOPER" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService() {
  const projectRepository = {
    findById: vi.fn(),
  } as unknown as ProjectRepository;

  const projectMembershipRepository = {
    create: vi.fn(),
    findByProjectAndUser: vi.fn(),
    findByProjectId: vi.fn(),
    updateRole: vi.fn(),
    delete: vi.fn(),
  } as unknown as ProjectMembershipRepository;

  const service = new ProjectMembershipService(
    projectMembershipRepository,
    projectRepository,
  );

  return {
    service,
    projectRepository,
    projectMembershipRepository,
  };
}

describe("ProjectMembershipService", () => {
  describe("addMember", () => {
    it("allows the project owner to add a member", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(null);
      vi.mocked(projectMembershipRepository.create).mockResolvedValue(
        memberMembership,
      );

      const result = await service.addMember(ownerId, {
        projectId,
        userId: memberId,
        role: "DEVELOPER",
      });

      expect(result).toEqual(memberMembership);
      expect(projectMembershipRepository.create).toHaveBeenCalledWith({
        projectId,
        userId: memberId,
        role: "DEVELOPER",
      });
    });

    it("rejects a non-owner from adding a member", async () => {
      const { service, projectRepository } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);

      await expect(
        service.addMember(otherUserId, {
          projectId,
          userId: memberId,
          role: "DEVELOPER",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects duplicate membership", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(memberMembership);

      await expect(
        service.addMember(ownerId, {
          projectId,
          userId: memberId,
          role: "DEVELOPER",
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects assigning the OWNER role", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(null);

      await expect(
        service.addMember(ownerId, {
          projectId,
          userId: memberId,
          role: "OWNER",
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects adding a member to a missing project", async () => {
      const { service, projectRepository } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(null);

      await expect(
        service.addMember(ownerId, {
          projectId,
          userId: memberId,
          role: "DEVELOPER",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("listMembers", () => {
    it("allows the project owner to list members", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(ownerMembership);
      vi.mocked(
        projectMembershipRepository.findByProjectId,
      ).mockResolvedValue([ownerMembership, memberMembership]);

      const result = await service.listMembers(ownerId, projectId);

      expect(result).toEqual([ownerMembership, memberMembership]);
    });

    it("allows an existing member to list project members", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(memberMembership);
      vi.mocked(
        projectMembershipRepository.findByProjectId,
      ).mockResolvedValue([ownerMembership, memberMembership]);

      const result = await service.listMembers(memberId, projectId);

      expect(result).toEqual([ownerMembership, memberMembership]);
    });

    it("rejects a non-member from listing members", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(null);

      await expect(
        service.listMembers(otherUserId, projectId),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects listing members for a missing project", async () => {
      const { service, projectRepository } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(null);

      await expect(
        service.listMembers(ownerId, projectId),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("updateMemberRole", () => {
    it("allows the project owner to update a member role", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      const updatedMembership = {
        ...memberMembership,
        role: "MAINTAINER" as const,
      };

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(memberMembership);
      vi.mocked(
        projectMembershipRepository.updateRole,
      ).mockResolvedValue(updatedMembership);

      const result = await service.updateMemberRole(
        ownerId,
        projectId,
        memberId,
        { role: "MAINTAINER" },
      );

      expect(result).toEqual(updatedMembership);
      expect(
        projectMembershipRepository.updateRole,
      ).toHaveBeenCalledWith(projectId, memberId, {
        role: "MAINTAINER",
      });
    });

    it("rejects a non-owner from updating a member role", async () => {
      const { service, projectRepository } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);

      await expect(
        service.updateMemberRole(
          otherUserId,
          projectId,
          memberId,
          { role: "MAINTAINER" },
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects changing the owner role", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(ownerMembership);

      await expect(
        service.updateMemberRole(
          ownerId,
          projectId,
          ownerId,
          { role: "ADMINISTRATOR" },
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects assigning the OWNER role", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(memberMembership);

      await expect(
        service.updateMemberRole(
          ownerId,
          projectId,
          memberId,
          { role: "OWNER" },
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects updating a missing member", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(null);

      await expect(
        service.updateMemberRole(
          ownerId,
          projectId,
          memberId,
          { role: "MAINTAINER" },
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("removeMember", () => {
    it("allows the project owner to remove a member", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(memberMembership);
      vi.mocked(
        projectMembershipRepository.delete,
      ).mockResolvedValue(memberMembership);

      await expect(
        service.removeMember(ownerId, projectId, memberId),
      ).resolves.toBeUndefined();

      expect(
        projectMembershipRepository.delete,
      ).toHaveBeenCalledWith(projectId, memberId);
    });

    it("rejects a non-owner from removing a member", async () => {
      const { service, projectRepository } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);

      await expect(
        service.removeMember(otherUserId, projectId, memberId),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects removing the project owner", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(ownerMembership);

      await expect(
        service.removeMember(ownerId, projectId, ownerId),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("rejects removing a missing member", async () => {
      const {
        service,
        projectRepository,
        projectMembershipRepository,
      } = createService();

      vi.mocked(projectRepository.findById).mockResolvedValue(project);
      vi.mocked(
        projectMembershipRepository.findByProjectAndUser,
      ).mockResolvedValue(null);

      await expect(
        service.removeMember(ownerId, projectId, memberId),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});