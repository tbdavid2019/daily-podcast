import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  R2_MULTIPART_MAX_PARTS,
  R2_MULTIPART_PART_SIZE,
  createPcmWavHeader,
  planAudioMultipartUpload,
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
