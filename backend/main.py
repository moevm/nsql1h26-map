from fastapi import FastAPI

from routers import data

app = FastAPI(title="WalkMap API")

app.include_router(data.router, prefix="/data")
