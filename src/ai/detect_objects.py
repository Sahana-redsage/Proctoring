import sys
import cv2
from ultralytics import YOLO
import json
import math

# Configuration
CONFIDENCE_THRESHOLD = 0.25
SAMPLE_RATE = 5  # Process every Nth frame (e.g., every 5th frame)

video_path = sys.argv[1]
model = YOLO("yolov8n.pt")

cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS)
if fps <= 0 or math.isnan(fps) or fps > 120: 
    fps = 30 # Default fallback

detections_per_second = {}
frame_index = 0

print(f"DEBUG: YOLO Processing {video_path} (FPS: {fps:.2f})", file=sys.stderr)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Process only every Nth frame to save CPU
    if frame_index % SAMPLE_RATE == 0:
        current_second = int(frame_index / fps)
        
        # If we already found a phone in this second, skip to save compute?
        # Yes, unless we want to confirm, but 'True' is enough.
        if not detections_per_second.get(current_second, False):
            results = model(frame, verbose=False, conf=CONFIDENCE_THRESHOLD)
            
            found_phone = False
            for r in results:
                for box in r.boxes:
                    cls = int(box.cls[0])
                    name = model.names[cls]
                    
                    # Check for phone-related objects
                    if name in ["cell phone", "mobile phone", "telephone"]: 
                         # Added 'book' back just in case, but focused on phone.
                        found_phone = True
                        print(f"DEBUG: Frame {frame_index} (Sec {current_second}): detected {name} ({float(box.conf[0]):.2f})", file=sys.stderr)
                        break
            
            if found_phone:
                detections_per_second[current_second] = True

    frame_index += 1

cap.release()
print("DEBUG: YOLO Finished processing", file=sys.stderr)

# Convert map to sorted list [boolean, boolean, ...]
# We expect roughly 10 seconds for a 10s chunk.
# But simply Max second found + 1.
max_sec = max(detections_per_second.keys()) if detections_per_second else 0
# ensure at least 10 seconds if possible? Or just return what we found.
# The worker expects an array that matches frames?
# chunk.worker.js loop: `faceData.faceCounts.length`.
# We need to match that length??
# `detect_faces.py` does `frame_interval = max(fps, 1)` -> 1 per second.
# So `faceData.faceCounts` length is roughly video duration in seconds.
# We should mimic that length.
# But we don't know faceData length here.
# We'll return based on max_sec. Ideally should be consistent.

final_output = []
# We'll go up to max_sec + 1
for i in range(max_sec + 1):
    final_output.append(detections_per_second.get(i, False))
    
# Padding safety: if video was 9.8s, face_detect might define 10 bins.
# It's fine, the worker loop uses `faceData.faceCounts.length` and accesses `objectData.phoneDetected[i] || false`.
# So if we are short, it defaults to False. If we are long, it ignores.
# However, if we are short because the phone was only in the 1st second and video is 10s, max_sec is 0.
# We should try to fill up to duration.
video_duration_sec = int(frame_index / fps)
if len(final_output) < video_duration_sec:
    for i in range(len(final_output), video_duration_sec):
        final_output.append(False)

print(json.dumps({
    "phoneDetected": final_output
}))
