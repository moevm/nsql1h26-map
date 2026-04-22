from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import driver
from routers import auth, data, map, walks, routes, users
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

app.include_router(users.router, prefix="/api/users")
app.include_router(data.router, prefix="/data")
app.include_router(map.router, prefix="/api/map")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(walks.router, prefix="/api/walks")
app.include_router(routes.router, prefix="/api/routes")
