import type { Request, Response } from "express";

export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json({
    status: "ok",
    service: process.env.APP_NAME ?? "forgemind-service",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
