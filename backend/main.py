from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import driver
from routers import auth, data, map, walks, routes, users, walkpoints, tiles, mapnodes, trackfiles, districts, pois
from routers.auth import get_current_user
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

_auth = [Depends(get_current_user)]

app.include_router(map.router,        prefix="/api/map")
app.include_router(auth.router,       prefix="/api/auth")
app.include_router(data.router,       prefix="/data")
app.include_router(districts.router,  prefix="/api/districts",  dependencies=_auth)
app.include_router(trackfiles.router, prefix="/api/trackfiles", dependencies=_auth)
app.include_router(mapnodes.router,   prefix="/api/mapnodes",   dependencies=_auth)
app.include_router(tiles.router,      prefix="/api/tiles",      dependencies=_auth)
app.include_router(walkpoints.router, prefix="/api/walkpoints", dependencies=_auth)
app.include_router(users.router,      prefix="/api/users",      dependencies=_auth)
app.include_router(walks.router,      prefix="/api/walks",      dependencies=_auth)
app.include_router(routes.router,     prefix="/api/routes",     dependencies=_auth)
app.include_router(pois.router,       prefix="/api/pois",       dependencies=_auth)
