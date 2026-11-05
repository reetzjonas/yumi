import {
  HOUSEHOLD_TRANSFER_MAX_BYTES,
  type HouseholdTransfer,
  householdTransferSchema,
} from "@yumi/shared";
import { HTTPException } from "hono/http-exception";

export function ownedData<T extends { householdId: string | null }>(record: T) {
  const { householdId: _householdId, ...data } = record;
  return data;
}

export function serializeArchive(archive: object): HouseholdTransfer {
  const json = JSON.stringify(archive);
  if (Buffer.byteLength(json) > HOUSEHOLD_TRANSFER_MAX_BYTES)
    throw new HTTPException(413, {
      message: "household_transfer_too_large",
    });
  const result = householdTransferSchema.safeParse(JSON.parse(json));
  if (!result.success)
    throw new HTTPException(422, {
      message: "household_data_not_portable",
    });
  return result.data;
}
