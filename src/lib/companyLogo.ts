import "server-only";
import { saveUpload } from "@/lib/storage";

/**
 * A logo for a company's papers, kept with the uploads.
 *
 * Whatever picture is chosen, PNG, JPEG, WebP, GIF or SVG, is turned into a
 * PNG no larger than the papers need, so a 5 MB photograph of a logo becomes a
 * small file and the PDF can always draw it. Transparency is kept.
 */
export async function saveCompanyLogo(file: File): Promise<string> {
  const sharp = (await import("sharp")).default;
  let png: Buffer;
  try {
    png = await sharp(Buffer.from(await file.arrayBuffer()), { density: 300 })
      .rotate()
      .resize({ width: 1200, height: 600, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw new Error("That file is not a picture the papers can use.");
  }
  const saved = await saveUpload(new File([new Uint8Array(png)], "logo.png", { type: "image/png" }));
  return saved.relativePath;
}
