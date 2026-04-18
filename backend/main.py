from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import driver
from routers import data, map
from seed import run_seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_seed(driver)
    yield
    await driver.close()


app = FastAPI(title="WalkMap API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router, prefix="/data")
app.include_router(map.router, prefix="/api/map")
