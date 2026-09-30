import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

import {
  ConflictError,
  NotFoundError,
} from "@forgemind/shared-errors";

import { errorHandler } from "@forgemind/sdk";

import { createProjectMembershipRoutes } from "./project-membership-routes.js";
import type { ProjectMembershipService } from "../../application/project-membership-service.js";
import { JwtService } from "../../infrastructure/security/jwt-service.js";

const jwtSecret =
  "test-secret-that-is-at-least-32-characters-long";

const ownerId = "owner-1";
const memberId = "member-1";
const projectId = "project-1";

const jwtService = new JwtService(jwtSecret);

function createToken(userId: string): string {
  return `Bearer ${jwt.sign(
    {
      userId,
      workspaceId: "workspace-1",
    },
    jwtSecret,
    {
      expiresIn: "1h",
    },
  )}`;
}

function createMembershipService() {
  return {
    addMember: vi.fn(),
    listMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  } as unknown as ProjectMembershipService;
}

function createApp(service: ProjectMembershipService) {
  const app = express();

  app.use(express.json());
  app.use(
    "/api/projects/:id/members",
    createProjectMembershipRoutes(service, jwtService),
  );

  app.use(errorHandler);

  return app;
}

const ownerMembership = {
  projectId,
  userId: ownerId,
  role: "OWNER" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const developerMembership = {
  projectId,
  userId: memberId,
  role: "DEVELOPER" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Project Membership API", () => {
  describe("POST /api/projects/:id/members", () => {
    it("returns 401 when authentication is missing", async () => {
      const service = createMembershipService();
      const app = createApp(service);

      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .send({
          userId: memberId,
          role: "DEVELOPER",
        });

      expect(response.status).toBe(401);
      expect(service.addMember).not.toHaveBeenCalled();
    });

    it("returns 401 when the JWT is invalid", async () => {
      const service = createMembershipService();
      const app = createApp(service);

      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set("Authorization", "Bearer invalid-token")
        .send({
          userId: memberId,
          role: "DEVELOPER",
        });

      expect(response.status).toBe(401);
      expect(service.addMember).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid request data", async () => {
      const service = createMembershipService();
      const app = createApp(service);

      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set("Authorization", createToken(ownerId))
        .send({
          userId: "",
          role: "INVALID_ROLE",
        });

      expect(response.status).toBe(400);
      expect(service.addMember).not.toHaveBeenCalled();
    });

    it("creates a project membership", async () => {
      const service = createMembershipService();

      vi.mocked(service.addMember).mockResolvedValue(
        developerMembership,
      );

      const app = createApp(service);

      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set("Authorization", createToken(ownerId))
        .send({
          userId: memberId,
          role: "DEVELOPER",
        });

      expect(response.status).toBe(201);

      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          projectId,
          userId: memberId,
          role: "DEVELOPER",
        }),
      });

      expect(service.addMember).toHaveBeenCalledWith(
        ownerId,
        {
          projectId,
          userId: memberId,
          role: "DEVELOPER",
        },
      );
    });

    it("returns 404 when the membership service reports a missing project", async () => {
      const service = createMembershipService();

      vi.mocked(service.addMember).mockRejectedValue(
        new NotFoundError("Project not found"),
      );

      const app = createApp(service);

      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set("Authorization", createToken(ownerId))
        .send({
          userId: memberId,
          role: "DEVELOPER",
        });

      expect(response.status).toBe(404);
    });

    it("returns 409 when the membership already exists", async () => {
      const service = createMembershipService();

      vi.mocked(service.addMember).mockRejectedValue(
        new ConflictError(
          "User is already a project member",
        ),
      );

      const app = createApp(service);

      const response = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set("Authorization", createToken(ownerId))
        .send({
          userId: memberId,
          role: "DEVELOPER",
        });

      expect(response.status).toBe(409);
    });
  });

  describe("GET /api/projects/:id/members", () => {
    it("returns 401 when authentication is missing", async () => {
      const service = createMembershipService();
      const app = createApp(service);

      const response = await request(app).get(
        `/api/projects/${projectId}/members`,
      );

      expect(response.status).toBe(401);
      expect(service.listMembers).not.toHaveBeenCalled();
    });

    it("returns project members", async () => {
      const service = createMembershipService();

      vi.mocked(service.listMembers).mockResolvedValue([
        ownerMembership,
        developerMembership,
      ]);

      const app = createApp(service);

      const response = await request(app)
        .get(`/api/projects/${projectId}/members`)
        .set("Authorization", createToken(ownerId));

      expect(response.status).toBe(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: ownerId,
            role: "OWNER",
          }),
          expect.objectContaining({
            userId: memberId,
            role: "DEVELOPER",
          }),
        ]),
      });

      expect(service.listMembers).toHaveBeenCalledWith(
        ownerId,
        projectId,
      );
    });

    it("returns 404 when the requester is not a project member", async () => {
      const service = createMembershipService();

      vi.mocked(service.listMembers).mockRejectedValue(
        new NotFoundError("Project not found"),
      );

      const app = createApp(service);

      const response = await request(app)
        .get(`/api/projects/${projectId}/members`)
        .set("Authorization", createToken("other-user"));

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/projects/:id/members/:userId", () => {
    it("returns 401 when authentication is missing", async () => {
      const service = createMembershipService();
      const app = createApp(service);

      const response = await request(app)
        .put(`/api/projects/${projectId}/members/${memberId}`)
        .send({
          role: "MAINTAINER",
        });

      expect(response.status).toBe(401);
      expect(service.updateMemberRole).not.toHaveBeenCalled();
    });

    it("returns 400 for an invalid role", async () => {
      const service = createMembershipService();
      const app = createApp(service);

      const response = await request(app)
        .put(`/api/projects/${projectId}/members/${memberId}`)
        .set("Authorization", createToken(ownerId))
        .send({
          role: "INVALID_ROLE",
        });

      expect(response.status).toBe(400);
      expect(service.updateMemberRole).not.toHaveBeenCalled();
    });

    it("updates a project member role", async () => {
      const service = createMembershipService();

      const updatedMembership = {
        ...developerMembership,
        role: "MAINTAINER" as const,
      };

      vi.mocked(service.updateMemberRole).mockResolvedValue(
        updatedMembership,
      );

      const app = createApp(service);

      const response = await request(app)
        .put(`/api/projects/${projectId}/members/${memberId}`)
        .set("Authorization", createToken(ownerId))
        .send({
          role: "MAINTAINER",
        });

      expect(response.status).toBe(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          projectId,
          userId: memberId,
          role: "MAINTAINER",
        }),
      });

      expect(service.updateMemberRole).toHaveBeenCalledWith(
        ownerId,
        projectId,
        memberId,
        {
          role: "MAINTAINER",
        },
      );
    });

    it("returns 404 when the requester is not authorized", async () => {
      const service = createMembershipService();

      vi.mocked(service.updateMemberRole).mockRejectedValue(
        new NotFoundError("Project not found"),
      );

      const app = createApp(service);

      const response = await request(app)
        .put(`/api/projects/${projectId}/members/${memberId}`)
        .set("Authorization", createToken("other-user"))
        .send({
          role: "MAINTAINER",
        });

      expect(response.status).toBe(404);
    });

    it("returns 409 when the role change violates a business rule", async () => {
      const service = createMembershipService();

      vi.mocked(service.updateMemberRole).mockRejectedValue(
        new ConflictError(
          "The project owner role cannot be changed",
        ),
      );

      const app = createApp(service);

      const response = await request(app)
        .put(`/api/projects/${projectId}/members/${ownerId}`)
        .set("Authorization", createToken(ownerId))
        .send({
          role: "ADMINISTRATOR",
        });

      expect(response.status).toBe(409);
    });
  });

  describe("DELETE /api/projects/:id/members/:userId", () => {
    it("returns 401 when authentication is missing", async () => {
      const service = createMembershipService();
      const app = createApp(service);

      const response = await request(app).delete(
        `/api/projects/${projectId}/members/${memberId}`,
      );

      expect(response.status).toBe(401);
      expect(service.removeMember).not.toHaveBeenCalled();
    });

    it("removes a project member", async () => {
      const service = createMembershipService();

      vi.mocked(service.removeMember).mockResolvedValue(
        undefined,
      );

      const app = createApp(service);

      const response = await request(app)
        .delete(
          `/api/projects/${projectId}/members/${memberId}`,
        )
        .set("Authorization", createToken(ownerId));

      expect(response.status).toBe(204);
      expect(response.text).toBe("");

      expect(service.removeMember).toHaveBeenCalledWith(
        ownerId,
        projectId,
        memberId,
      );
    });

    it("returns 404 when the member does not exist", async () => {
      const service = createMembershipService();

      vi.mocked(service.removeMember).mockRejectedValue(
        new NotFoundError("Project member not found"),
      );

      const app = createApp(service);

      const response = await request(app)
        .delete(
          `/api/projects/${projectId}/members/${memberId}`,
        )
        .set("Authorization", createToken(ownerId));

      expect(response.status).toBe(404);
    });

    it("returns 409 when attempting to remove the project owner", async () => {
      const service = createMembershipService();

      vi.mocked(service.removeMember).mockRejectedValue(
        new ConflictError(
          "The project owner cannot be removed",
        ),
      );

      const app = createApp(service);

      const response = await request(app)
        .delete(
          `/api/projects/${projectId}/members/${ownerId}`,
        )
        .set("Authorization", createToken(ownerId));

      expect(response.status).toBe(409);
    });
  });
});