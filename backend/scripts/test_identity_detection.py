import cv2
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from detectors.identity_verifier import verify_identity
from app.repositories.sessions import get_reference_image

SESSION_ID = "56444444-4444-4444-4444-444444444444"
VIDEO_PATH = "scripts/test_chunk_0.webm"

# Get reference image
ref_url = get_reference_image(SESSION_ID)
print("=" * 60)
print(f"Reference Image URL: {ref_url}")
print("=" * 60)

# Open video and test a few frames
cap = cv2.VideoCapture(VIDEO_PATH)
fps = cap.get(cv2.CAP_PROP_FPS)
print(f"Video FPS: {fps}")
print(f"Total frames: {int(cap.get(cv2.CAP_PROP_FRAME_COUNT))}")
print("=" * 60)

# Test frames at different timestamps
test_timestamps = [0, 5, 10, 15, 20, 25]  # seconds

for ts in test_timestamps:
    frame_num = int(ts * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
    ret, frame = cap.read()
    
    if not ret:
        print(f"❌ Frame at {ts}s: Could not read")
        continue
    
    result = verify_identity(frame, ref_url)
    
    if result is True:
        status = "✅ MATCH"
    elif result is False:
        status = "❌ MISMATCH"
    else:
        status = "⚠️  INCONCLUSIVE"
    
    print(f"Frame at {ts}s: {status} (result={result})")

cap.release()
print("=" * 60)
