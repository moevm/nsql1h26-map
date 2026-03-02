package com.example.neo4japp;

import org.springframework.data.neo4j.repository.Neo4jRepository;
import org.springframework.data.neo4j.repository.query.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TestNodeRepository extends Neo4jRepository<TestNode, Long> {

    @Query("MATCH (n:Test) RETURN n ORDER BY n.time DESC LIMIT 1")
    Optional<TestNode> findLatest();
}
