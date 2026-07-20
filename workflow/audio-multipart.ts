export const WAV_HEADER_BYTES = 44
export const R2_MULTIPART_PART_SIZE = 5 * 1024 * 1024
export const R2_MULTIPART_MAX_PARTS = 10_000

const WAV_MAX_PCM_BYTES = 0xFFFF_FFFF - 36

export interface AudioBatchObject {
  key: string
  size: number
}

export type AudioMultipartPiece
  = | { kind: 'wav-header', offset: number, length: number }
    | { kind: 'r2', key: string, offset: number, length: number }

export interface AudioMultipartPart {
  partNumber: number
  length: number
  pieces: AudioMultipartPiece[]
}

export interface AudioMultipartPlan {
  totalLength: number
  pcmLength: number
  parts: AudioMultipartPart[]
}

interface AudioRangeBucket {
  get: (
    key: string,
    options: { range: { offset: number, length: number } },
  ) => Promise<{ body: ReadableStream } | null>
}

interface AudioMultipartTarget {
  uploadPart: (
    partNumber: number,
    value: ReadableStream,
  ) => Promise<{ partNumber: number, etag: string }>
}

interface AudioFixedLengthStream {
  readable: ReadableStream
  writable: WritableStream<ArrayBuffer | ArrayBufferView>
}

type AudioFixedLengthStreamFactory = (length: number) => AudioFixedLengthStream

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

export function createPcmWavHeader(
  pcmLength: number,
  sampleRate = 24_000,
  channelCount = 1,
  bitsPerSample = 16,
): Uint8Array {
  if (!Number.isSafeInteger(pcmLength) || pcmLength < 0 || pcmLength > WAV_MAX_PCM_BYTES) {
    throw new Error('PCM data is too large for a 32-bit RIFF/WAV header')
  }

  const header = new Uint8Array(WAV_HEADER_BYTES)
  const view = new DataView(header.buffer)
  const byteRate = sampleRate * channelCount * bitsPerSample / 8
  const blockAlign = channelCount * bitsPerSample / 8

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + pcmLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, pcmLength, true)

  return header
}

export function planAudioMultipartUpload(
  batches: readonly AudioBatchObject[],
  isWav: boolean,
): AudioMultipartPlan {
  if (batches.length === 0) {
    throw new Error('At least one audio batch is required')
  }

  const logicalPieces: AudioMultipartPiece[] = []
  let pcmLength = 0

  if (isWav) {
    logicalPieces.push({ kind: 'wav-header', offset: 0, length: WAV_HEADER_BYTES })
  }

  for (const batch of batches) {
    if (!batch.key || !Number.isSafeInteger(batch.size) || batch.size <= 0) {
      throw new Error(`Invalid audio batch metadata: ${batch.key || '<missing key>'}`)
    }

    if (isWav) {
      if (batch.size <= WAV_HEADER_BYTES) {
        throw new Error(`WAV batch must contain a valid 44-byte header and PCM data: ${batch.key}`)
      }
      const dataLength = batch.size - WAV_HEADER_BYTES
      pcmLength += dataLength
      logicalPieces.push({
        kind: 'r2',
        key: batch.key,
        offset: WAV_HEADER_BYTES,
        length: dataLength,
      })
    }
    else {
      pcmLength += batch.size
      logicalPieces.push({ kind: 'r2', key: batch.key, offset: 0, length: batch.size })
    }
  }

  if (isWav && pcmLength > WAV_MAX_PCM_BYTES) {
    throw new Error('PCM data is too large for a 32-bit RIFF/WAV header')
  }

  const totalLength = pcmLength + (isWav ? WAV_HEADER_BYTES : 0)
  const partCount = Math.ceil(totalLength / R2_MULTIPART_PART_SIZE)
  if (partCount > R2_MULTIPART_MAX_PARTS) {
    throw new Error(`Audio requires more than the R2 limit of 10,000 parts`)
  }

  const parts: AudioMultipartPart[] = []
  let pieceIndex = 0
  let consumedFromPiece = 0

  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const partLength = Math.min(
      R2_MULTIPART_PART_SIZE,
      totalLength - (partNumber - 1) * R2_MULTIPART_PART_SIZE,
    )
    const pieces: AudioMultipartPiece[] = []
    let remaining = partLength

    while (remaining > 0) {
      const source = logicalPieces[pieceIndex]
      if (!source) {
        throw new Error('Audio multipart plan ended before the expected length')
      }

      const length = Math.min(source.length - consumedFromPiece, remaining)
      if (source.kind === 'wav-header') {
        pieces.push({
          kind: 'wav-header',
          offset: source.offset + consumedFromPiece,
          length,
        })
      }
      else {
        pieces.push({
          kind: 'r2',
          key: source.key,
          offset: source.offset + consumedFromPiece,
          length,
        })
      }

      consumedFromPiece += length
      remaining -= length

      if (consumedFromPiece === source.length) {
        pieceIndex++
        consumedFromPiece = 0
      }
    }

    parts.push({ partNumber, length: partLength, pieces })
  }

  return { totalLength, pcmLength, parts }
}

export async function uploadAudioMultipartPart(
  bucket: AudioRangeBucket,
  multipart: AudioMultipartTarget,
  part: AudioMultipartPart,
  wavHeader: Uint8Array,
  createFixedLengthStream: AudioFixedLengthStreamFactory = length => new FixedLengthStream(length),
) {
  const { readable, writable } = createFixedLengthStream(part.length)

  const writePart = async () => {
    try {
      for (const piece of part.pieces) {
        if (piece.kind === 'wav-header') {
          const bytes = wavHeader.subarray(piece.offset, piece.offset + piece.length)
          const writer = writable.getWriter()
          try {
            await writer.write(bytes)
          }
          finally {
            writer.releaseLock()
          }
          continue
        }

        const object = await bucket.get(piece.key, {
          range: { offset: piece.offset, length: piece.length },
        })
        if (!object) {
          throw new Error(`Missing audio batch range: ${piece.key}`)
        }
        await object.body.pipeTo(writable, { preventClose: true })
      }

      const writer = writable.getWriter()
      try {
        await writer.close()
      }
      finally {
        writer.releaseLock()
      }
    }
    catch (error) {
      const writer = writable.getWriter()
      await writer.abort(error).catch(() => undefined)
      writer.releaseLock()
      throw error
    }
  }

  const [uploadResult, writeResult] = await Promise.allSettled([
    multipart.uploadPart(part.partNumber, readable),
    writePart(),
  ])

  if (writeResult.status === 'rejected') {
    throw writeResult.reason
  }
  if (uploadResult.status === 'rejected') {
    throw uploadResult.reason
  }
  return uploadResult.value
}
