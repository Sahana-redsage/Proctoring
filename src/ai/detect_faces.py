import sys
import json
import cv2
import mediapipe as mp

video_path = sys.argv[1]

mp_face_detection = mp.solutions.face_detection

detector = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.6
)


cap = cv2.VideoCapture(video_path)

face_counts = []
head_pitches = []

fps = cap.get(cv2.CAP_PROP_FPS)
# WebM from MediaRecorder often reports 1000 FPS (timebase). Standardize.
if fps <= 0 or fps > 120:
    fps = 30

frame_interval = max(int(fps), 1)

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
            # Simple pose estimation for the first face
            detection = result.detections[0]
            
            # Keypoints: 0=RightEye, 1=LeftEye, 2=NoseTip, 3=Mouth, 4=RightEar, 5=LeftEar
            kp = detection.location_data.relative_keypoints
            nose = kp[2]
            right_ear = kp[4]
            left_ear = kp[5]
            
            # Yaw Estimation (Turning Left/Right)
            # Compare nose x to the midpoint of ears
            ear_mid_x = (right_ear.x + left_ear.x) / 2
            # Range approx -0.5 to 0.5? Normalize by ear distance
            ear_dist = abs(right_ear.x - left_ear.x) + 1e-6
            yaw = (nose.x - ear_mid_x) / ear_dist * 2.0  # Scale factor

            # Pitch Estimation (Up/Down)
            # Compare nose y to ear y (very rough)
            ear_mid_y = (right_ear.y + left_ear.y) / 2
            video_aspect_ratio = 16/9 # Assumption
            pitch = (nose.y - ear_mid_y) 
            
            head_pitches.append(yaw) # Storing Yaw in "headPitch" field for now as caller expects simple array
            # Ideally we should output both, but schema has `headPitch` array. 
            # Let's map "Gaze Deviation" to this value. 
            # Deviation = euclidean distance from center?
            # Let's just store Yaw for now as it's most common "looking away".
            
            print(f"DEBUG: Frame {frame_index}: detected {count} faces, Yaw: {yaw:.2f}, Pitch: {pitch:.2f}", file=sys.stderr)
        else:
            head_pitches.append(0)

        face_counts.append(count)

    frame_index += 1

cap.release()
print("DEBUG: Finished processing video", file=sys.stderr)

print(json.dumps({
    "faceCounts": face_counts,
    "headPitch": head_pitches
}))
