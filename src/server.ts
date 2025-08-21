import { cfg } from "./config";
import { buildApp } from "./app";
import { restoreAuthIfExists } from "./services/ringcentral.service";

restoreAuthIfExists();
const app = buildApp();
app.listen(Number(cfg.PORT), () =>
  console.log(`Server listening on ${cfg.PORT}`)
);
