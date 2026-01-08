import uuid

class RedisLock:
    def __init__(self, redis_client, key, ttl=30):
        self.redis = redis_client
        self.key = key
        self.value = str(uuid.uuid4())
        self.ttl = ttl

    def acquire(self):
        return self.redis.set(self.key, self.value, nx=True, ex=self.ttl)

    def release(self):
        if self.redis.get(self.key) == self.value:
            self.redis.delete(self.key)
