import mediapipe as mp
import numpy as np

_mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True
)

def is_looking_away(frame):
    h, w, _ = frame.shape
    rgb = frame[:, :, ::-1]

    result = _mp_face_mesh.process(rgb)
    if not result.multi_face_landmarks:
        return False

    landmarks = result.multi_face_landmarks[0].landmark

    nose = landmarks[1]     # nose tip
    left_eye = landmarks[33]
    right_eye = landmarks[263]

    nose_x = nose.x * w
    eye_center_x = (left_eye.x + right_eye.x) / 2 * w

    deviation = abs(nose_x - eye_center_x)

    # threshold tuned for webcams
    return deviation > 25
