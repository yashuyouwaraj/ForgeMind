import { config, createForgeMindApp } from "@forgemind/sdk";

const app = createForgeMindApp({
	serviceName: "api-gateway",
	apiPrefix: config.API_PREFIX,
});

export default app;
