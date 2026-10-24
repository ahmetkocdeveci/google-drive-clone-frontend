import assert from 'node:assert/strict'
import { inflateRawSync } from 'node:zlib'

/** Reads only the small archive produced by our synthetic browser fixture. Never extracts to disk. */
export function readFixtureZip(bytes: Buffer): Map<string, Buffer> {
  assert.ok(bytes.length < 1024 * 1024, 'Fixture archive must remain small')
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(end >= 0, 'ZIP end record exists')
  const count = bytes.readUInt16LE(end + 10)
  assert.ok(count <= 20)
  let cursor = bytes.readUInt32LE(end + 16)
  const result = new Map<string, Buffer>()
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50)
    const method = bytes.readUInt16LE(cursor + 10)
    assert.ok(method === 0 || method === 8)
    const size = bytes.readUInt32LE(cursor + 20)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const local = bytes.readUInt32LE(cursor + 42)
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    assert.ok(!result.has(name), 'ZIP paths are unique')
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'))
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    assert.ok(start + size <= bytes.length)
    const compressed = bytes.subarray(start, start + size)
    result.set(
      name,
      method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1024 * 1024 }) : compressed,
    )
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return result
}
