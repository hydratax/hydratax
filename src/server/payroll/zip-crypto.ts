/**
 * Traditional PKWARE ZipCrypto ZIP (stored + encrypted).
 * Opens in Windows Explorer / macOS Archive Utility with the password.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Bytes(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32Step(crc: number, byte: number): number {
  return (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
}

class ZipCryptoKeys {
  k0 = 305419896;
  k1 = 591751049;
  k2 = 878082192;

  constructor(password: string) {
    for (const byte of Buffer.from(password, "utf8")) {
      this.update(byte);
    }
  }

  update(byte: number) {
    this.k0 = crc32Step(this.k0, byte);
    this.k1 =
      (Math.imul((this.k1 + (this.k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    this.k2 = crc32Step(this.k2, (this.k1 >>> 24) & 0xff);
  }

  magic(): number {
    const temp = (this.k2 | 2) >>> 0;
    return ((Math.imul(temp, temp ^ 1) >>> 8) & 0xff) >>> 0;
  }
}

function encryptBuffer(plain: Uint8Array, password: string, crc: number): Buffer {
  const keys = new ZipCryptoKeys(password);
  const header = Buffer.alloc(12);
  for (let i = 0; i < 11; i++) header[i] = Math.floor(Math.random() * 256);
  header[11] = (crc >>> 24) & 0xff;
  const out = Buffer.alloc(plain.length + 12);
  for (let i = 0; i < 12; i++) {
    const p = header[i]!;
    out[i] = p ^ keys.magic();
    keys.update(p);
  }
  for (let i = 0; i < plain.length; i++) {
    const p = plain[i]!;
    out[i + 12] = p ^ keys.magic();
    keys.update(p);
  }
  return out;
}

export function decryptZipCrypto(cipher: Uint8Array, password: string): Buffer {
  const keys = new ZipCryptoKeys(password);
  const out = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) {
    const p = (cipher[i]! ^ keys.magic()) & 0xff;
    out[i] = p;
    keys.update(p);
  }
  return out.subarray(12);
}

function u16(n: number) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}
function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function dosDateTime(d = new Date()) {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export type ZipEntry = { name: string; data: Buffer | string };

export function createPasswordProtectedZip(
  entries: ZipEntry[],
  password: string,
): Buffer {
  if (password.length < 8) {
    throw new Error("Pack password must be at least 8 characters.");
  }
  const { time, date } = dosDateTime();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const plain = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, "utf8");
    const crc = crc32Bytes(plain);
    const encrypted = encryptBuffer(plain, password, crc);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(1), // encrypted
      u16(0), // stored
      u16(time),
      u16(date),
      u32(crc),
      u32(encrypted.length),
      u32(plain.length),
      u16(name.length),
      u16(0),
      name,
      encrypted,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(1),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(encrypted.length),
      u32(plain.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, eocd]);
}
