import crypto from "node:crypto";
export class StudioCaptures {
  private entries = new Map<
    string,
    { id: string; at: string; images: { mimeType: string; data: string }[] }
  >();
  save(raw: any) {
    const images = (raw?.content ?? [])
      .filter(
        (c: any) =>
          c.type === "image" &&
          ["image/png", "image/jpeg", "image/webp"].includes(c.mimeType) &&
          typeof c.data === "string" &&
          c.data.length < 8 * 1024 * 1024 &&
          /^[A-Za-z0-9+/=\r\n]+$/.test(c.data),
      )
      .slice(0, 2)
      .map((c: any) => ({ mimeType: c.mimeType, data: c.data }));
    if (!images.length) return null;
    const id = "cap_" + crypto.randomBytes(12).toString("hex"),
      at = new Date().toISOString();
    this.entries.set(id, { id, at, images });
    while (this.entries.size > 4) this.entries.delete(this.entries.keys().next().value!);
    return {
      captureId: id,
      at,
      imageCount: images.length,
      source: "actual Studio MCP capture",
      visualAccepted: false,
    };
  }
  get(id: string) {
    const row = this.entries.get(id);
    if (!row || Date.now() - Date.parse(row.at) > 15 * 60000)
      throw Error("Capture expired; take a fresh Studio screenshot");
    return row;
  }
}
