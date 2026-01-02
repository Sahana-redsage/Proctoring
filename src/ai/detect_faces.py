import sys
import cv2
import mediapipe as mp
import json

video_path = sys.argv[1]

mp_face = mp.solutions.face_detection.FaceDetection(
    model_selection=0, min_detection_confidence=0.5
)

cap = cv2.VideoCapture(video_path)

face_counts = []
head_pitches = []

fps = int(cap.get(cv2.CAP_PROP_FPS))
frame_interval = max(fps, 1)

frame_index = 0

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    if frame_index % frame_interval == 0:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = mp_face.process(rgb)

        count = 0
        if result.detections:
            count = len(result.detections)

        face_counts.append(count)
        head_pitches.append(0)  # placeholder for face mesh later

    frame_index += 1

cap.release()

print(json.dumps({
    "faceCounts": face_counts,
    "headPitch": head_pitches
}))
