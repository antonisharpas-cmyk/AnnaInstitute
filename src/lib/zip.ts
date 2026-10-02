import "server-only";
import { deflateRawSync } from "node:zlib";

/**
 * A ZIP file, written here rather than with a library.
 *
 * The CRM needs exactly one kind: a handful of files, names with folders in
 * them, made in memory and handed over whole. That is a few dozen lines of the
 * format, and one less package to install on a 512 MB server.
 */

export type ZipEntry = { name: string; data: Buffer; at?: Date };

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The time as a ZIP keeps it: two 16 bit numbers, to the nearest two seconds. */
function dosTime(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

export function makeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const used = new Set<string>();

  for (const entry of entries) {
    /* A name twice in one folder gets a number, so nothing is lost. */
    let name = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf(".");
      const stem = dot > name.lastIndexOf("/") ? name.slice(0, dot) : name;
      const ext = dot > name.lastIndexOf("/") ? name.slice(dot) : "";
      let n = 2;
      while (used.has(`${stem} (${n})${ext}`.toLowerCase())) n++;
      name = `${stem} (${n})${ext}`;
    }
    used.add(name.toLowerCase());

    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(entry.data);
    const packed = deflateRawSync(entry.data);
    const stored = packed.length >= entry.data.length;
    const body = stored ? entry.data : packed;
    const method = stored ? 0 : 8;
    const { time, date } = dosTime(entry.at ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}
