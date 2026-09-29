import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { NotFoundError } from "@forgemind/shared-errors";

import { createProjectApp } from "../../app.js";
import type { ProjectService } from "../../application/project-service.js";
import { JwtService } from "../../infrastructure/security/jwt-service.js";

const JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";

function createToken(userId: string): string {
  return jwt.sign(
    {
      userId,
      workspaceId,
    },
    JWT_SECRET,
    {
      expiresIn: "1h",
    },
  );
}

function createProjectServiceMock() {
  return {
    createProject: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  } as unknown as ProjectService;
}

function createTestApp(projectService: ProjectService) {
  return createProjectApp({
    projectService,
    jwtService: new JwtService(JWT_SECRET),
  });
}

describe("Project API", () => {
  describe("authentication", () => {
    it("rejects requests without an authentication token", async () => {
      const projectService = createProjectServiceMock();
      const app = createTestApp(projectService);

      const response = await request(app).get("/api/projects");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(projectService.listProjects).not.toHaveBeenCalled();
    });

    it("rejects requests with an invalid authentication token", async () => {
      const projectService = createProjectServiceMock();
      const app = createTestApp(projectService);

      const response = await request(app)
        .get("/api/projects")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(projectService.listProjects).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/projects", () => {
    it("creates a project for the authenticated user", async () => {
      const projectService = createProjectServiceMock();

      projectService.createProject = vi.fn().mockResolvedValue({
        id: projectId,
        name: "ForgeMind",
        description: "Software Intelligence Platform",
        ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = createTestApp(projectService);

      const response = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${createToken(ownerId)}`)
        .send({
          name: "ForgeMind",
          description: "Software Intelligence Platform",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(projectId);
      expect(response.body.data.ownerId).toBe(ownerId);

      expect(projectService.createProject).toHaveBeenCalledWith(ownerId, {
        name: "ForgeMind",
        description: "Software Intelligence Platform",
      });
    });

    it("rejects invalid project input", async () => {
      const projectService = createProjectServiceMock();
      const app = createTestApp(projectService);

      const response = await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${createToken(ownerId)}`)
        .send({
          name: "",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(projectService.createProject).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/projects", () => {
    it("returns paginated projects for the authenticated user", async () => {
      const projectService = createProjectServiceMock();

      projectService.listProjects = vi.fn().mockResolvedValue({
        projects: [
          {
            id: projectId,
            name: "ForgeMind",
            description: "Software Intelligence Platform",
            ownerId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
      });

      const app = createTestApp(projectService);

      const response = await request(app)
        .get("/api/projects?page=1&pageSize=20")
        .set("Authorization", `Bearer ${createToken(ownerId)}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalPages: 1,
        totalRecords: 1,
      });

      expect(projectService.listProjects).toHaveBeenCalledWith(ownerId, {
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe("GET /api/projects/:id", () => {
    it("returns a project owned by the authenticated user", async () => {
      const projectService = createProjectServiceMock();

      projectService.getProject = vi.fn().mockResolvedValue({
        id: projectId,
        name: "ForgeMind",
        description: "Software Intelligence Platform",
        ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = createTestApp(projectService);

      const response = await request(app)
        .get(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${createToken(ownerId)}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(projectId);

      expect(projectService.getProject).toHaveBeenCalledWith(
        projectId,
        ownerId,
      );
    });

    it("does not expose another user's project", async () => {
      const projectService = createProjectServiceMock();

      projectService.getProject = vi.fn().mockRejectedValue(new NotFoundError("Project not found"));

      const app = createTestApp(projectService);

      const response = await request(app)
        .get(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${createToken(otherUserId)}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);

      expect(projectService.getProject).toHaveBeenCalledWith(
        projectId,
        otherUserId,
      );
    });
  });

  describe("PUT /api/projects/:id", () => {
    it("updates a project for its authenticated owner", async () => {
      const projectService = createProjectServiceMock();

      projectService.updateProject = vi.fn().mockResolvedValue({
        id: projectId,
        name: "ForgeMind Updated",
        description: "Updated description",
        ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const app = createTestApp(projectService);

      const response = await request(app)
        .put(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${createToken(ownerId)}`)
        .send({
          name: "ForgeMind Updated",
          description: "Updated description",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("ForgeMind Updated");

      expect(projectService.updateProject).toHaveBeenCalledWith(
        projectId,
        ownerId,
        {
          name: "ForgeMind Updated",
          description: "Updated description",
        },
      );
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("deletes a project for its authenticated owner", async () => {
      const projectService = createProjectServiceMock();

      projectService.deleteProject = vi.fn().mockResolvedValue(undefined);

      const app = createTestApp(projectService);

      const response = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${createToken(ownerId)}`);

      expect(response.status).toBe(204);
      expect(response.text).toBe("");

      expect(projectService.deleteProject).toHaveBeenCalledWith(
        projectId,
        ownerId,
      );
    });
  });
});
