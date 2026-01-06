const { spawn } = require("child_process");
const path = require("path");

const PYTHON_PATH = path.join(
  process.cwd(),
  "ai-env-3.10",
  "Scripts",
  "python.exe"
);

function runPython(script, args) {
  return new Promise((resolve, reject) => {
    // Ensure args is array
    const argList = Array.isArray(args) ? args : [args];
    const process = spawn(PYTHON_PATH, [script, ...argList]);

    let output = "";
    let errorOutput = "";

    process.stdout.on("data", data => {
      output += data.toString();
    });

    process.stderr.on("data", data => {
      errorOutput += data.toString();
    });

    process.on("close", code => {
      // Log debug output from Python (stderr)
      if (errorOutput) {
        console.log(`[Python Debug] ${script}:\n${errorOutput}`);
      }

      if (code !== 0) {
        return reject(
          new Error(`Python error: ${errorOutput || "Unknown error"}`)
        );
      }

      try {
        resolve(JSON.parse(output));
      } catch (err) {
        reject(
          new Error("Failed to parse Python output: " + output)
        );
      }
    });
  });
}

async function detectFaces(videoPath, refImagePath = null) {
  const args = [videoPath];
  if (refImagePath) args.push(refImagePath);

  return runPython(
    path.join(process.cwd(), "src", "ai", "detect_faces.py"),
    args
  );
}

async function detectObjects(videoPath) {
  return runPython(
    path.join(process.cwd(), "src", "ai", "detect_objects.py"),
    videoPath
  );
}

module.exports = {
  detectFaces,
  detectObjects
};
