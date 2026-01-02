import sys
import json
import cv2
import mediapipe as mp

video_path = sys.argv[1]

mp_face_detection = mp.solutions.face_detection

detector = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.5
)


cap = cv2.VideoCapture(video_path)

face_counts = []
head_pitches = []

fps = int(cap.get(cv2.CAP_PROP_FPS))
frame_interval = max(fps, 1)

frame_index = 0

print(f"DEBUG: Processing video {video_path}, FPS: {fps}", file=sys.stderr)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    if frame_index % frame_interval == 0:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = detector.process(rgb)

        count = 0
        if result.detections:
            count = len(result.detections)

        face_counts.append(count)
        head_pitches.append(0)  # placeholder for face mesh later
        
        print(f"DEBUG: Frame {frame_index}: detected {count} faces", file=sys.stderr)

    frame_index += 1

cap.release()
print("DEBUG: Finished processing video", file=sys.stderr)

print(json.dumps({
    "faceCounts": face_counts,
    "headPitch": head_pitches
}))
