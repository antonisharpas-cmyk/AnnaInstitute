import "server-only";
import { createReadStream } from "node:fs";
import { crc32 } from "node:zlib";

/**
 * A zip file of documents, written as it is sent.
 *
 * The other zip, in zip.ts, is made whole in memory, which suits the
 * accountant's handful of papers. A development's drawings and renders can come
 * to a hundred megabytes, more than a small server should hold at once.
 *
 * The files are stored as they are, without compressing them again: brochures,
 * drawings and renders are PDFs and pictures that are already compressed, so
 * squeezing them would only cost time. Nothing is held in memory but the file
 * being read, so a development with a hundred megabytes of drawings is sent
 * the same way as one with a single brochure.
 */

export type StreamEntry = { name: string; path: string };

const DOS_TIME = (date: Date) =>
  ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff;
const DOS_DATE = (date: Date) =>
  (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;

/** Bit 3: the sizes and checksum follow the data. Bit 11: the name is UTF-8, so Greek names stay Greek. */
const FLAGS = 0x0008 | 0x0800;

export function zipStream(entries: StreamEntry[]): ReadableStream<Uint8Array> {
  const now = new Date();
  const time = DOS_TIME(now);
  const day = DOS_DATE(now);
  const central: Buffer[] = [];
  let offset = 0;
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= entries.length) {
        const directory = Buffer.concat(central);
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(0, 4);
        end.writeUInt16LE(0, 6);
        end.writeUInt16LE(central.length, 8);
        end.writeUInt16LE(central.length, 10);
        end.writeUInt32LE(directory.length, 12);
        end.writeUInt32LE(offset, 16);
        end.writeUInt16LE(0, 20);
        controller.enqueue(new Uint8Array(Buffer.concat([directory, end])));
        controller.close();
        return;
      }

      const entry = entries[index++];
      const name = Buffer.from(entry.name, "utf8");
      const start = offset;

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(FLAGS, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(day, 12);
      local.writeUInt32LE(0, 14);
      local.writeUInt32LE(0, 18);
      local.writeUInt32LE(0, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      controller.enqueue(new Uint8Array(Buffer.concat([local, name])));
      offset += local.length + name.length;

      let crc = 0;
      let size = 0;
      try {
        for await (const chunk of createReadStream(entry.path)) {
          const bytes = chunk as Buffer;
          crc = crc32(bytes, crc);
          size += bytes.length;
          controller.enqueue(new Uint8Array(bytes));
        }
      } catch {
        /* A file whose copy has gone is left empty rather than breaking the whole zip. */
      }
      offset += size;

      const descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(crc >>> 0, 4);
      descriptor.writeUInt32LE(size, 8);
      descriptor.writeUInt32LE(size, 12);
      controller.enqueue(new Uint8Array(descriptor));
      offset += descriptor.length;

      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(20, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(FLAGS, 8);
      record.writeUInt16LE(0, 10);
      record.writeUInt16LE(time, 12);
      record.writeUInt16LE(day, 14);
      record.writeUInt32LE(crc >>> 0, 16);
      record.writeUInt32LE(size, 20);
      record.writeUInt32LE(size, 24);
      record.writeUInt16LE(name.length, 28);
      record.writeUInt16LE(0, 30);
      record.writeUInt16LE(0, 32);
      record.writeUInt16LE(0, 34);
      record.writeUInt16LE(0, 36);
      record.writeUInt32LE(0, 38);
      record.writeUInt32LE(start, 42);
      central.push(Buffer.concat([record, name]));
    },
  });
}

/** Names inside one zip, each once: a second "Plan.pdf" in the same folder becomes "Plan (2).pdf". */
export function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const seen = used.get(key) ?? 0;
    used.set(key, seen + 1);
    if (seen === 0) return name;
    const dot = name.lastIndexOf(".");
    const slash = name.lastIndexOf("/");
    return dot > slash ? `${name.slice(0, dot)} (${seen + 1})${name.slice(dot)}` : `${name} (${seen + 1})`;
  });
}
