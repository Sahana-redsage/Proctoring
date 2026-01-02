import sys
import cv2
from ultralytics import YOLO
import json

video_path = sys.argv[1]

model = YOLO("yolov8n.pt")  # nano model

cap = cv2.VideoCapture(video_path)

detections = []
fps = int(cap.get(cv2.CAP_PROP_FPS))
frame_interval = max(fps, 1)
frame_index = 0

print(f"DEBUG: YOLO Processing video {video_path}, FPS: {fps}", file=sys.stderr)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    if frame_index % frame_interval == 0:
        results = model(frame, verbose=False)

        found_phone = False
        for r in results:
            for box in r.boxes:
                cls = int(box.cls[0])
                name = model.names[cls]
                conf = float(box.conf[0])

                if name in ["cell phone", "book", "laptop"] and conf > 0.4:
                    found_phone = True
                    print(f"DEBUG: Frame {frame_index}: detected {name} ({conf:.2f})", file=sys.stderr)

        detections.append(found_phone)

    frame_index += 1

cap.release()
print("DEBUG: YOLO Finished processing video", file=sys.stderr)

print(json.dumps({
    "phoneDetected": detections
}))
