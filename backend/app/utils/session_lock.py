import time

class SessionLock:
    def __init__(self, redis_client, key, ttl=120):
        self.redis = redis_client
        self.key = key
        self.ttl = ttl

    def acquire(self):
        # SET key value NX EX ttl
        return self.redis.set(self.key, "1", nx=True, ex=self.ttl)

    def release(self):
        self.redis.delete(self.key)
