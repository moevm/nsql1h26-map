from contextlib import asynccontextmanager

from fastapi import FastAPI

from database import driver
from routers import data
from seed import run_seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_seed(driver)
    yield
    await driver.close()


app = FastAPI(title="WalkMap API", lifespan=lifespan)

app.include_router(data.router, prefix="/data")
