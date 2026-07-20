import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  R2_MULTIPART_MAX_PARTS,
  R2_MULTIPART_PART_SIZE,
  createPcmWavHeader,
  planAudioMultipartUpload,
  uploadAudioMultipartPart,
} from '../workflow/audio-multipart'

const MIB = 1024 * 1024

describe('audio multipart planning', () => {
  it('repacks MP3 batches into uniform 5 MiB parts without gaps', () => {
    const plan = planAudioMultipartUpload([
      { key: 'batch-0.mp3', size: 3 * MIB },
      { key: 'batch-1.mp3', size: 4 * MIB },
    ], false)

    assert.equal(plan.totalLength, 7 * MIB)
    assert.deepEqual(plan.parts.map(part => part.length), [5 * MIB, 2 * MIB])
    assert.deepEqual(plan.parts[0].pieces, [
      { kind: 'r2', key: 'batch-0.mp3', offset: 0, length: 3 * MIB },
      { kind: 'r2', key: 'batch-1.mp3', offset: 0, length: 2 * MIB },
    ])
    assert.deepEqual(plan.parts[1].pieces, [
      { kind: 'r2', key: 'batch-1.mp3', offset: 2 * MIB, length: 2 * MIB },
    ])
  })

  it('keeps one WAV header and strips the header from every source batch', () => {
    const plan = planAudioMultipartUpload([
      { key: 'batch-0.wav', size: 3 * MIB },
      { key: 'batch-1.wav', size: 4 * MIB },
    ], true)

    assert.equal(plan.totalLength, 7 * MIB - 44)
    assert.deepEqual(plan.parts.map(part => part.length), [5 * MIB, 2 * MIB - 44])
    assert.deepEqual(plan.parts[0].pieces, [
      { kind: 'wav-header', offset: 0, length: 44 },
      { kind: 'r2', key: 'batch-0.wav', offset: 44, length: 3 * MIB - 44 },
      { kind: 'r2', key: 'batch-1.wav', offset: 44, length: 2 * MIB },
    ])
    assert.deepEqual(plan.parts[1].pieces, [
      { kind: 'r2', key: 'batch-1.wav', offset: 44 + 2 * MIB, length: 2 * MIB - 44 },
    ])
  })

  it('allows a single final part smaller than 5 MiB', () => {
    const plan = planAudioMultipartUpload([{ key: 'short.mp3', size: MIB }], false)

    assert.equal(plan.parts.length, 1)
    assert.equal(plan.parts[0].length, MIB)
  })

  it('rejects invalid WAV batches and objects beyond the R2 part-count limit', () => {
    assert.throws(
      () => planAudioMultipartUpload([{ key: 'bad.wav', size: 44 }], true),
      /valid 44-byte header and PCM data/,
    )
    assert.throws(
      () => planAudioMultipartUpload([
        { key: 'too-large.mp3', size: R2_MULTIPART_PART_SIZE * R2_MULTIPART_MAX_PARTS + 1 },
      ], false),
      /10,000 parts/,
    )
  })
})

describe('PCM WAV header', () => {
  it('writes a 44-byte mono 24 kHz 16-bit RIFF header for the full PCM length', () => {
    const pcmLength = 123456
    const header = createPcmWavHeader(pcmLength)
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
    const text = (offset: number, length: number) =>
      String.fromCharCode(...header.subarray(offset, offset + length))

    assert.equal(header.byteLength, 44)
    assert.equal(text(0, 4), 'RIFF')
    assert.equal(view.getUint32(4, true), 36 + pcmLength)
    assert.equal(text(8, 4), 'WAVE')
    assert.equal(view.getUint16(22, true), 1)
    assert.equal(view.getUint32(24, true), 24000)
    assert.equal(view.getUint16(34, true), 16)
    assert.equal(text(36, 4), 'data')
    assert.equal(view.getUint32(40, true), pcmLength)
  })
})

describe('audio multipart streaming', () => {
  it('streams exact ranged bytes into each upload part without whole-object buffering', async () => {
    const first = new Uint8Array(3 * MIB)
    const second = new Uint8Array(4 * MIB)
    first.fill(0x11, 44)
    second.fill(0x22, 44)
    const objects = new Map([
      ['batch-0.wav', first],
      ['batch-1.wav', second],
    ])
    const plan = planAudioMultipartUpload([
      { key: 'batch-0.wav', size: first.byteLength },
      { key: 'batch-1.wav', size: second.byteLength },
    ], true)
    const uploaded = new Map<number, Uint8Array>()
    const bucket = {
      async get(key: string, options: { range: { offset: number, length: number } }) {
        const source = objects.get(key)
        if (!source)
          return null
        const bytes = source.slice(options.range.offset, options.range.offset + options.range.length)
        return {
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes)
              controller.close()
            },
          }),
        }
      },
    }
    const multipart = {
      async uploadPart(partNumber: number, body: ReadableStream) {
        uploaded.set(partNumber, new Uint8Array(await new Response(body).arrayBuffer()))
        return { partNumber, etag: `etag-${partNumber}` }
      },
    }
    const streamFactory = () => new TransformStream<ArrayBuffer | ArrayBufferView, Uint8Array>()
    const header = createPcmWavHeader(plan.pcmLength)

    for (const part of plan.parts) {
      const result = await uploadAudioMultipartPart(bucket, multipart, part, header, streamFactory)
      assert.equal(result.etag, `etag-${part.partNumber}`)
      assert.equal(uploaded.get(part.partNumber)?.byteLength, part.length)
    }

    const firstPart = uploaded.get(1)
    const secondPart = uploaded.get(2)
    assert.ok(firstPart)
    assert.ok(secondPart)
    assert.deepEqual(firstPart.subarray(0, 44), header)
    assert.equal(firstPart[44], 0x11)
    assert.equal(firstPart[3 * MIB - 1], 0x11)
    assert.equal(firstPart[3 * MIB], 0x22)
    assert.equal(secondPart[0], 0x22)
    assert.equal(secondPart.at(-1), 0x22)
  })

  it('keeps the final Workflow merge on ranged streams instead of arrayBuffer()', async () => {
    const source = await readFile(new URL('../workflow/audio.ts', import.meta.url), 'utf8')
    const finalMerge = source.slice(source.indexOf('// 4. Merge all batches'))

    assert.match(finalMerge, /createMultipartUpload/)
    assert.match(finalMerge, /uploadAudioMultipartPart/)
    assert.doesNotMatch(finalMerge, /\.arrayBuffer\(\)/)
    assert.doesNotMatch(finalMerge, /combineAudioBuffers/)
  })

  it('stops the stream producer when R2 rejects before consuming the upload body', async () => {
    const plan = planAudioMultipartUpload([{ key: 'batch.mp3', size: MIB }], false)
    const bucket = {
      async get() {
        return {
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(MIB))
              controller.close()
            },
          }),
        }
      },
    }
    const multipart = {
      async uploadPart() {
        throw new Error('upload unavailable')
      },
    }
    const streamFactory = () => new TransformStream<ArrayBuffer | ArrayBufferView, Uint8Array>()
    const upload = uploadAudioMultipartPart(
      bucket,
      multipart,
      plan.parts[0],
      new Uint8Array(0),
      streamFactory,
    )
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('stream did not stop')), 100))

    await assert.rejects(Promise.race([upload, timeout]), /upload unavailable/)
  })
})
