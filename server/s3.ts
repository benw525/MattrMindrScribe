import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { Readable } from 'stream';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;

export const s3Configured = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && S3_BUCKET_NAME);

const s3Client = s3Configured
  ? new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export async function uploadToS3(
  fileBuffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  return `s3://${key}`;
}

export async function uploadFileToS3(
  filePath: string,
  key: string,
  contentType: string
): Promise<string> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  const fileStats = await stat(filePath);
  const fileStream = createReadStream(filePath);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
      ContentLength: fileStats.size,
    })
  );

  return `s3://${key}`;
}

export function getS3PublicUrl(key: string): string {
  if (S3_PUBLIC_URL) {
    const baseUrl = S3_PUBLIC_URL.endsWith('/') ? S3_PUBLIC_URL.slice(0, -1) : S3_PUBLIC_URL;
    return `${baseUrl}/${key}`;
  }
  return `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

export async function deleteFromS3(key: string): Promise<void> {
  if (!s3Client || !S3_BUCKET_NAME) return;

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      })
    );
  } catch (err: any) {
    console.error(`[S3] Failed to delete ${key}:`, err.message);
  }
}

export async function downloadFromS3(key: string): Promise<string> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`No body in S3 response for key: ${key}`);
  }

  const totalBytes = response.ContentLength;
  console.log(`[S3 Download] Starting: ${key} (${totalBytes ? (totalBytes / 1024 / 1024).toFixed(1) + ' MB' : 'unknown size'})`);

  const tempDir = path.join(tmpdir(), `s3_download_${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  const ext = path.extname(key) || '.bin';
  const tempPath = path.join(tempDir, `file${ext}`);

  const { createWriteStream } = await import('fs');
  const { Transform } = await import('stream');
  const { pipeline } = await import('stream/promises');
  const readStream = response.Body as Readable;
  const writeStream = createWriteStream(tempPath);

  let downloaded = 0;
  let lastLog = Date.now();
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length;
      const now = Date.now();
      if (now - lastLog > 10000) {
        const mb = (downloaded / 1024 / 1024).toFixed(1);
        const pct = totalBytes ? ` (${((downloaded / totalBytes) * 100).toFixed(0)}%)` : '';
        console.log(`[S3 Download] ${mb} MB downloaded${pct}`);
        lastLog = now;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(readStream, progress, writeStream);
  } catch (downloadErr: any) {
    try {
      const { rmSync } = await import('fs');
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    throw downloadErr;
  }
  console.log(`[S3 Download] Complete: ${(downloaded / 1024 / 1024).toFixed(1)} MB → ${tempPath}`);

  return tempPath;
}

export async function streamFromS3(key: string, res: any): Promise<void> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`No body in S3 response for key: ${key}`);
  }

  if (response.ContentType) {
    res.setHeader('Content-Type', response.ContentType);
  }
  if (response.ContentLength) {
    res.setHeader('Content-Length', response.ContentLength);
  }

  const stream = response.Body as Readable;
  stream.pipe(res);
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return url;
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return url;
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  const result = await s3Client.send(
    new CreateMultipartUploadCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    })
  );

  if (!result.UploadId) {
    throw new Error('Failed to create multipart upload');
  }

  return result.UploadId;
}

export async function getPresignedPartUrl(key: string, uploadId: string, partNumber: number): Promise<string> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  const command = new UploadPartCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>
): Promise<void> {
  if (!s3Client || !S3_BUCKET_NAME) {
    throw new Error('S3 is not configured');
  }

  await s3Client.send(
    new CompleteMultipartUploadCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    })
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  if (!s3Client || !S3_BUCKET_NAME) return;

  try {
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      })
    );
  } catch (err: any) {
    console.error(`[S3] Failed to abort multipart upload ${uploadId}:`, err.message);
  }
}

export function isCloudStorageUrl(fileUrl: string): boolean {
  return fileUrl.startsWith('s3://') || fileUrl.startsWith('r2://');
}

export function getKeyFromStorageUrl(fileUrl: string): string {
  return fileUrl.replace(/^(s3|r2):\/\//, '');
}
