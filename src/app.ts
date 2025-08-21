import express from "express";
import { routes } from "./routes";

export function buildApp() {
  const app = express();
  app.use(routes);
  return app;
}
