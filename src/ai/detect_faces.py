import sys
import json
import cv2
import mediapipe as mp
import numpy as np

video_path = sys.argv[1]
ref_image_path = sys.argv[2] if len(sys.argv) > 2 else None

# Check if verification is needed
verify_identity = False
ref_image_bgr = None

if ref_image_path:
    try:
        from deepface import DeepFace
        print(f"DEBUG: Loading reference image from {ref_image_path}", file=sys.stderr)
        # DeepFace handles loading internally usually, but for consistency we can load it to check validity
        # But wait, DeepFace.verify accepts paths OR numpy arrays.
        # Let's load it as numpy array to avoid file I/O every frame.
        ref_image_bgr = cv2.imread(ref_image_path)
        if ref_image_bgr is not None:
            verify_identity = True
            print("DEBUG: Reference face loaded for DeepFace.", file=sys.stderr)
            # Pre-warm or check? 
            # DeepFace.extract_faces(img_path=ref_image_bgr)
        else:
            print("DEBUG: Could not read reference image!", file=sys.stderr)
    except ImportError:
        print("DEBUG: deepface library not found. Skipping verification.", file=sys.stderr)
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
        # MediaPipe needs RGB
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
            
            # 2. Identity Verification (DeepFace)
            # Only verify if we have 1 face and identity is enabled
            if verify_identity and count == 1:
                try:
                    # DeepFace.verify expects BGR if passing numpy array (OpenCV standard)
                    # or path. We have 'frame' which is BGR.
                    # enforce_detection=False because we already detected face with MediaPipe?
                    # No, let DeepFace detect/align for better accuracy.
                    # Use a lightweight model like "ArcFace" or "VGG-Face" (default).
                    # 'opencv' backend is fast but less accurate detection.
                    # 'ssd' is good.
                    
                    # NOTE: This might be SLOW on CPU. But we only run it once per second (frame_interval).
                    
                    obj = DeepFace.verify(
                        img1_path = frame, 
                        img2_path = ref_image_bgr, 
                        model_name = "VGG-Face", # Robust
                        detector_backend = "opencv", # Fast
                        enforce_detection = False, # Prevent crash if DeepFace detector misses but MediaPipe hit
                        distance_metric = "cosine"
                    )
                    
                    if not obj['verified']:
                        is_mismatch = True
                        print(f"DEBUG: Frame {frame_index}: Identity Mismatch! Distance: {obj['distance']}", file=sys.stderr)
                    else:
                        print(f"DEBUG: Frame {frame_index}: Verified. Distance: {obj['distance']}", file=sys.stderr)

                except Exception as e:
                    print(f"DEBUG: Verification error: {e}", file=sys.stderr)
            
            print(f"DEBUG: Frame {frame_index}: detected {count} faces, Yaw: {yaw:.2f}", file=sys.stderr)
        else:
            head_pitches.append(0)
            
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
