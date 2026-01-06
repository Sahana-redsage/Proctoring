const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { R2 } = require("../config/env");
const fs = require("fs");

const r2Client = new S3Client({
  region: "auto",
  endpoint: R2.endpoint,
  credentials: {
    accessKeyId: R2.accessKeyId,
    secretAccessKey: R2.secretAccessKey
  }
});

async function uploadToR2(filePath, key) {
  const fileStream = fs.createReadStream(filePath);

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2.bucket,
      Key: key,
      Body: fileStream,
      ContentType: "video/webm" // Adjust dynamically if needed, but webm is standard here
    })
  );

  return `${R2.publicUrl}/${key}`;
}

async function deleteFromR2(key) {
  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2.bucket,
        Key: key
      })
    );
    console.log(`🗑️ [R2] Deleted: ${key}`);
    return true;
  } catch (err) {
    console.error(`❌ [R2] Delete failed for ${key}:`, err);
    return false;
  }
}

module.exports = { uploadToR2, deleteFromR2 };
