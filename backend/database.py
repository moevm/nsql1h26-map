from neo4j import AsyncGraphDatabase

driver = AsyncGraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "password"))


async def get_session():
    async with driver.session() as session:
        yield session
