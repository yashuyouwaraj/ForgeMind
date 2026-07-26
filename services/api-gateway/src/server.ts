import { config } from "@forgemind/sdk";
import app from "./app.js";

app.listen(config.PORT, () => {
  console.log(`${config.APP_NAME} running on port ${config.PORT}`);
});