const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

async function mergeChunks(sessionId, chunkFiles) {
  const tmpDir = path.join(process.cwd(), "tmp", "merge");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const listFile = path.join(tmpDir, `${sessionId}_chunks.txt`);
  const outputFile = path.join(tmpDir, `${sessionId}_final.webm`);

  const content = chunkFiles.map(f => `file '${f}'`).join("\n");
  fs.writeFileSync(listFile, content);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .save(outputFile)
      .on("end", () => resolve(outputFile))
      .on("error", reject);
  });
}

module.exports = { mergeChunks };
