import sys
import json
import cv2
import mediapipe as mp

video_path = sys.argv[1]
ref_image_path = sys.argv[2] if len(sys.argv) > 2 else None

# Check if verification is needed
verify_identity = False
ref_encoding = None

if ref_image_path:
    try:
        import face_recognition
        import numpy as np
        print(f"DEBUG: Loading reference image from {ref_image_path}", file=sys.stderr)
        ref_image = face_recognition.load_image_file(ref_image_path)
        encodings = face_recognition.face_encodings(ref_image)
        if len(encodings) > 0:
            ref_encoding = encodings[0]
            verify_identity = True
            print("DEBUG: Reference face encoding successful", file=sys.stderr)
        else:
            print("DEBUG: No face found in reference image!", file=sys.stderr)
    except ImportError:
        print("DEBUG: face_recognition library not found. Skipping verification.", file=sys.stderr)
    except Exception as e:
        print(f"DEBUG: Error loading reference face: {e}", file=sys.stderr)

mp_face_detection = mp.solutions.face_detection
detector = mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.6)

cap = cv2.VideoCapture(video_path)
face_counts = []
head_pitches = []
mismatches = []

fps = cap.get(cv2.CAP_PROP_FPS)
if fps <= 0 or fps > 120: fps = 30
frame_interval = max(int(fps), 1)
frame_index = 0

print(f"DEBUG: Processing video {video_path}, FPS: {fps}", file=sys.stderr)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break

    if frame_index % frame_interval == 0:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = detector.process(rgb)
        
        count = 0
        is_mismatch = False
        
        if result.detections:
            count = len(result.detections)
            detection = result.detections[0]
            kp = detection.location_data.relative_keypoints
            
            # 1. Pose Estimation (MediaPipe)
            right_ear = kp[4]
            left_ear = kp[5]
            nose = kp[2]
            ear_mid_x = (right_ear.x + left_ear.x) / 2
            ear_dist = abs(right_ear.x - left_ear.x) + 1e-6
            yaw = (nose.x - ear_mid_x) / ear_dist * 2.0
            
            head_pitches.append(yaw)
            
            # 2. Identity Verification (face_recognition)
            # OPTIMIZATION: Only check identity if exactly ONE face is present.
            # If 0 faces -> NO_FACE event handles it.
            # If >1 faces -> MULTIPLE_PEOPLE event handles it.
            if verify_identity and count == 1:
                try:
                    # MediaPipe detected a face, now verify it
                    # face_recognition expects RGB
                    # We use 'hog' model which is faster than cnn
                    encodings = face_recognition.face_encodings(rgb)
                    if len(encodings) > 0:
                        # Compare with reference
                        # tolerance=0.6 is default
                        match = face_recognition.compare_faces([ref_encoding], encodings[0], tolerance=0.6)[0]
                        if not match:
                            is_mismatch = True
                            print(f"DEBUG: Frame {frame_index}: Identity Mismatch!", file=sys.stderr)
                        else:
                            print(f"DEBUG: Frame {frame_index}: Face Match Verified.", file=sys.stderr)
                    else:
                        # MediaPipe found face but dlib didn't? 
                        # Could be occlusion or partial face.
                        # Do not flag mismatch to avoid false positives.
                        pass
                except Exception as e:
                    print(f"DEBUG: Verification error: {e}", file=sys.stderr)
            
            print(f"DEBUG: Frame {frame_index}: detected {count} faces, Yaw: {yaw:.2f}", file=sys.stderr)
        else:
            head_pitches.append(0)
            # No face = No mismatch (it's a NO_FACE event, not mismatch)
            
        face_counts.append(count)
        mismatches.append(is_mismatch)

    frame_index += 1

cap.release()
print("DEBUG: Finished processing video", file=sys.stderr)

print(json.dumps({
    "faceCounts": face_counts,
    "headPitch": head_pitches,
    "mismatches": mismatches
}))
