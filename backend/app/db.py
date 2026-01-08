import psycopg2
from psycopg2.extras import RealDictCursor
from app.config import settings

def get_db():
    conn = psycopg2.connect(
        settings.DATABASE_URL,
        cursor_factory=RealDictCursor
    )
    return conn
