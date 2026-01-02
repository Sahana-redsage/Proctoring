const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
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
      ContentType: "video/webm"
    })
  );

  return `${R2.publicUrl}/${key}`;
}

module.exports = { uploadToR2 };
