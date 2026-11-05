import {
  HOUSEHOLD_TRANSFER_MAX_BYTES,
  householdTransferSchema,
} from "@yumi/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { exportHousehold } from "../household-transfer/export";
import { importHousehold } from "../household-transfer/import";

export const householdTransfer = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/export", async (c) => {
    const archive = await exportHousehold(c.get("householdId"));
    c.header(
      "Content-Disposition",
      'attachment; filename="yumi-household-v1.json"',
    );
    c.header("Cache-Control", "no-store");
    return c.json(archive);
  })
  .post(
    "/import",
    bodyLimit({
      maxSize: HOUSEHOLD_TRANSFER_MAX_BYTES,
      onError: (c) => c.json({ error: "household_transfer_too_large" }, 413),
    }),
    async (c, next) => {
      if (
        !c.req
          .header("content-type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        throw new HTTPException(415, { message: "expected_json" });
      await next();
    },
    validator("json", (value) => householdTransferSchema.parse(value)),
    async (c) => {
      const archive = c.req.valid("json");
      const result = await importHousehold(c.get("householdId"), archive);
      return c.json(result, 201);
    },
  );
