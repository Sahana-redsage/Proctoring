import mediapipe as mp

_mp_face = mp.solutions.face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.5
)

def count_faces(frame):
    rgb = frame[:, :, ::-1]
    result = _mp_face.process(rgb)
    if not result.detections:
        return 0
    return len(result.detections)
