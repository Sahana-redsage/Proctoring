import subprocess
import os
import tempfile

def merge_videos(video_paths, output_path):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".txt") as f:
        for path in video_paths:
            f.write(f"file '{path}'\n".encode())
        list_file = f.name

    cmd = [
        "ffmpeg",
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", list_file,
        "-c", "copy",
        output_path
    ]

    subprocess.run(cmd, check=True)
    os.unlink(list_file)
