from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.sessions import router as sessions_router
from app.api.chunks import router as chunks_router
from app.api.admin import router as admin_router

app = FastAPI(title="Proctoring Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router, prefix="/sessions")
app.include_router(chunks_router, prefix="/chunks")
app.include_router(admin_router)

@app.get("/health")
def health():
    return {"status": "ok"}
