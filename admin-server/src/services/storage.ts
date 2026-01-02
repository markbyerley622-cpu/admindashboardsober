// =============================================================================
// STORAGE SERVICE - Local file storage for development
// =============================================================================
// In production, replace with S3-compatible storage
// =============================================================================
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Local storage directory
const STORAGE_DIR = path.join(process.cwd(), 'uploads');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * Generate a unique storage key for a proof file
 * Format: proofs/{year}/{month}/{day}/{uuid}.{extension}
 */
export function generateProofKey(
  walletAddress: string,
  originalFilename: string
): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const uuid = uuidv4();
  const extension = originalFilename.split('.').pop() || 'bin';

  // Include a hash of the wallet address for organization
  const walletPrefix = walletAddress.slice(0, 8);

  return `proofs/${year}/${month}/${day}/${walletPrefix}/${uuid}.${extension}`;
}

/**
 * Get full file path from key
 */
function getFilePath(key: string): string {
  return path.join(STORAGE_DIR, key);
}

/**
 * Upload a file to local storage
 */
export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string
): Promise<{ key: string; size: number }> {
  const filePath = getFilePath(key);
  const dir = path.dirname(filePath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write file
  fs.writeFileSync(filePath, body);

  // Write metadata
  fs.writeFileSync(filePath + '.meta', JSON.stringify({
    contentType,
    uploadedAt: new Date().toISOString(),
    size: body.length,
  }));

  return {
    key,
    size: body.length,
  };
}

/**
 * Generate a URL for viewing a file (local dev - serves from API)
 */
export async function getSignedViewUrl(
  key: string,
  expiresIn?: number
): Promise<string> {
  // In development, return a local URL
  // The server will serve files from /api/v1/files/:key
  const encodedKey = encodeURIComponent(key);
  return `http://localhost:4000/api/v1/files/${encodedKey}`;
}

/**
 * Generate a signed URL for uploading a file
 * In dev mode, returns the confirm endpoint
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn?: number
): Promise<string> {
  // In development, uploads go through the API
  return `http://localhost:4000/api/v1/upload/direct?key=${encodeURIComponent(key)}`;
}

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  const filePath = getFilePath(key);
  return fs.existsSync(filePath);
}

/**
 * Delete a file
 */
export async function deleteFile(key: string): Promise<void> {
  const filePath = getFilePath(key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  if (fs.existsSync(filePath + '.meta')) {
    fs.unlinkSync(filePath + '.meta');
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  key: string
): Promise<{ contentType: string; size: number; lastModified: Date } | null> {
  const filePath = getFilePath(key);
  const metaPath = filePath + '.meta';

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const stats = fs.statSync(filePath);
    let contentType = 'application/octet-stream';

    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      contentType = meta.contentType || contentType;
    }

    return {
      contentType,
      size: stats.size,
      lastModified: stats.mtime,
    };
  } catch {
    return null;
  }
}

/**
 * Read a file (for serving)
 */
export async function readFile(key: string): Promise<Buffer | null> {
  const filePath = getFilePath(key);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath);
}
