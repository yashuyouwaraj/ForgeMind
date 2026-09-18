import { createForgeMindApp } from "@forgemind/sdk";

const app = createForgeMindApp({
  serviceName: "auth-service",
  requestLogging: true,
  cors: true,
  security: true,
  compression: true,
  apiPrefix: "/api",
});

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`ForgeMind Auth Service running on port ${port}`);
});