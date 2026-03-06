import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { Readable } from 'stream';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME?.toLowerCase();
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

export const r2Configured = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

const r2Client = r2Configured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export async function uploadToR2(
  fileBuffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (!r2Client || !R2_BUCKET_NAME) {
    throw new Error('R2 is not configured');
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  return `r2://${key}`;
}

export async function uploadFileToR2(
  filePath: string,
  key: string,
  contentType: string
): Promise<string> {
  if (!r2Client || !R2_BUCKET_NAME) {
    throw new Error('R2 is not configured');
  }

  const fileStats = await stat(filePath);
  const fileStream = createReadStream(filePath);

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
      ContentLength: fileStats.size,
    })
  );

  return `r2://${key}`;
}

export function getR2PublicUrl(key: string): string {
  if (!R2_PUBLIC_URL) {
    throw new Error('R2_PUBLIC_URL is not configured');
  }
  const baseUrl = R2_PUBLIC_URL.endsWith('/') ? R2_PUBLIC_URL.slice(0, -1) : R2_PUBLIC_URL;
  return `${baseUrl}/${key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
  if (!r2Client || !R2_BUCKET_NAME) return;

  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );
  } catch (err: any) {
    console.error(`[R2] Failed to delete ${key}:`, err.message);
  }
}

export async function downloadFromR2(key: string): Promise<string> {
  if (!r2Client || !R2_BUCKET_NAME) {
    throw new Error('R2 is not configured');
  }

  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`No body in R2 response for key: ${key}`);
  }

  const tempDir = path.join(tmpdir(), `r2_download_${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  const ext = path.extname(key) || '.bin';
  const tempPath = path.join(tempDir, `file${ext}`);

  const { createWriteStream } = await import('fs');
  const { pipeline } = await import('stream/promises');
  const readStream = response.Body as Readable;
  const writeStream = createWriteStream(tempPath);
  await pipeline(readStream, writeStream);

  return tempPath;
}

export async function streamFromR2(key: string, res: any): Promise<void> {
  if (!r2Client || !R2_BUCKET_NAME) {
    throw new Error('R2 is not configured');
  }

  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`No body in R2 response for key: ${key}`);
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

export function isR2Url(fileUrl: string): boolean {
  return fileUrl.startsWith('r2://');
}

export function getR2KeyFromUrl(fileUrl: string): string {
  return fileUrl.replace('r2://', '');
}
