import { Router } from "express";
export const webhookRouter = Router();

webhookRouter.post("/", (req, res) => {
  const v = req.get("Validation-Token");
  if (v) {
    res.set("Validation-Token", v);
    return res.status(200).end();
  }
  // TODO: handle events
  res.status(200).end();
});
