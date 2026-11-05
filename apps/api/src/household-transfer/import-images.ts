import type { HouseholdTransfer } from "@yumi/shared";
import { HTTPException } from "hono/http-exception";

async function imageBytes(encoded: string) {
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.toString("base64") !== encoded ||
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new HTTPException(400, { message: "invalid_transfer_image" });
  try {
    const image = new Bun.Image(bytes);
    const metadata = await image.metadata();
    if (
      metadata.format !== "webp" ||
      metadata.width > 4096 ||
      metadata.height > 4096
    )
      throw new Error("image_dimensions");
    // Decode without changing the stored bytes; malformed WebP must not be imported.
    await image.resize(1, 1).webp().bytes();
  } catch {
    throw new HTTPException(400, { message: "invalid_transfer_image" });
  }
  return bytes;
}

export async function readTransferImages(records: HouseholdTransfer["images"]) {
  const images: {
    id: string;
    recipeId: string;
    thumb: Buffer;
    full: Buffer;
  }[] = [];
  for (const image of records)
    images.push({
      id: crypto.randomUUID(),
      recipeId: image.recipeId,
      thumb: await imageBytes(image.thumb),
      full: await imageBytes(image.full),
    });
  return images;
}
