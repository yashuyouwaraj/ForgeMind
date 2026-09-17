import { createForgeMindApp } from "@forgemind/sdk";

const app = createForgeMindApp({
  serviceName: "api-gateway",
  requestLogging: true,
  cors: true,
  security: true,
  compression: true,
  apiPrefix: "/api",
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`ForgeMind API Gateway running on port ${port}`);
});