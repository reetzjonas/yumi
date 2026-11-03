import type { AppType } from "@yumi/api";
import { hc } from "hono/client";

export const api = hc<AppType>("/").api;
