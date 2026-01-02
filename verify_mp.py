import cv2
cap = cv2.VideoCapture("path\\to\\real\\chunk.webm")
print("Opened:", cap.isOpened())
ret, frame = cap.read()
print("First frame read:", ret)
