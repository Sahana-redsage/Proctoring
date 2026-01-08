import boto3
from app.config import settings

session = boto3.session.Session()
s3 = session.client(
    "s3",
    endpoint_url=settings.R2_ENDPOINT,
    aws_access_key_id=settings.R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
)

def upload_file(fileobj, key: str) -> str:
    s3.upload_fileobj(
        fileobj,
        settings.R2_BUCKET_NAME,
        key,
        ExtraArgs={"ACL": "public-read"}
    )
    return f"{settings.R2_PUBLIC_URL}/{key}"
