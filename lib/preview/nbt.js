// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — minimal NBT reader (Stage 7, world preview)
//
// Hand-rolled, dependency-free, browser-native. We deliberately do NOT use a
// Node-oriented NBT lib (prismarine-nbt etc.) because those assume a global
// `Buffer`, which doesn't exist in the browser / Web Worker where the builder
// generates the preview. NBT is a small big-endian binary format, so reading it
// off a DataView is straightforward and keeps the bundle tiny.
//
// Reference: https://minecraft.wiki/w/NBT_format
//
// We only need read support, and only the tags Minecraft chunks actually use.
// 64-bit Long / LongArray values are returned as BigInt so the packed
// block-state indices survive intact (they exceed Number's 53-bit mantissa).
// ─────────────────────────────────────────────────────────────────────────────

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

const utf8 = new TextDecoder("utf-8");

class NbtReader {
  constructor(bytes) {
    // bytes: Uint8Array. Use its underlying buffer with the correct offset so
    // we don't accidentally read a sibling view's data.
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.bytes = bytes;
    this.pos = 0;
  }

  _u8() {
    return this.view.getUint8(this.pos++);
  }
  _i8() {
    return this.view.getInt8(this.pos++);
  }
  _i16() {
    const v = this.view.getInt16(this.pos, false);
    this.pos += 2;
    return v;
  }
  _u16() {
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }
  _i32() {
    const v = this.view.getInt32(this.pos, false);
    this.pos += 4;
    return v;
  }
  _f32() {
    const v = this.view.getFloat32(this.pos, false);
    this.pos += 4;
    return v;
  }
  _f64() {
    const v = this.view.getFloat64(this.pos, false);
    this.pos += 8;
    return v;
  }
  _i64() {
    const v = this.view.getBigInt64(this.pos, false);
    this.pos += 8;
    return v;
  }
  _string() {
    const len = this._u16();
    const slice = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return utf8.decode(slice);
  }

  _payload(type) {
    switch (type) {
      case TAG_BYTE:
        return this._i8();
      case TAG_SHORT:
        return this._i16();
      case TAG_INT:
        return this._i32();
      case TAG_LONG:
        return this._i64();
      case TAG_FLOAT:
        return this._f32();
      case TAG_DOUBLE:
        return this._f64();
      case TAG_BYTE_ARRAY: {
        const len = this._i32();
        const arr = this.bytes.subarray(this.pos, this.pos + len);
        this.pos += len;
        return arr;
      }
      case TAG_STRING:
        return this._string();
      case TAG_LIST: {
        const itemType = this._u8();
        const len = this._i32();
        const out = new Array(len);
        for (let i = 0; i < len; i++) out[i] = this._payload(itemType);
        return out;
      }
      case TAG_COMPOUND: {
        const obj = {};
        for (;;) {
          const t = this._u8();
          if (t === TAG_END) break;
          const name = this._string();
          obj[name] = this._payload(t);
        }
        return obj;
      }
      case TAG_INT_ARRAY: {
        const len = this._i32();
        const arr = new Int32Array(len);
        for (let i = 0; i < len; i++) arr[i] = this._i32();
        return arr;
      }
      case TAG_LONG_ARRAY: {
        const len = this._i32();
        const arr = new BigInt64Array(len);
        for (let i = 0; i < len; i++) arr[i] = this._i64();
        return arr;
      }
      default:
        throw new Error(`Unknown NBT tag type ${type} at ${this.pos}`);
    }
  }
}

// Parse a complete NBT document. Returns the root payload (the named outer
// compound's contents), discarding the outer name as Minecraft chunks don't
// rely on it.
export function parseNbt(bytes) {
  const r = new NbtReader(bytes);
  const rootType = r._u8();
  if (rootType === TAG_END) return {};
  r._string(); // root name (ignored)
  return r._payload(rootType);
}
