package com.example.neo4japp;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
public class MainController {

    private final TestNodeRepository repository;

    public MainController(TestNodeRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/")
    public Map<String, Object> root() {
        // Write
        String nodeId = UUID.randomUUID().toString();
        TestNode node = new TestNode(nodeId, "Hello World", LocalDateTime.now().toString());
        repository.save(node);

        // Read latest
        TestNode latest = repository.findLatest().orElse(null);

        Map<String, Object> response = new HashMap<>();
        response.put("written", nodeId);
        response.put("read", latest);
        response.put("status", "success");
        return response;
    }
}
