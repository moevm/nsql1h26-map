package com.example.neo4japp;

import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;

@Node("Test")
public class TestNode {

    @Id
    @GeneratedValue
    private Long id;

    private String nodeId;
    private String text;
    private String time;

    public TestNode() {}

    public TestNode(String nodeId, String text, String time) {
        this.nodeId = nodeId;
        this.text = text;
        this.time = time;
    }

    public Long getId() { return id; }
    public String getNodeId() { return nodeId; }
    public String getText() { return text; }
    public String getTime() { return time; }

    public void setNodeId(String nodeId) { this.nodeId = nodeId; }
    public void setText(String text) { this.text = text; }
    public void setTime(String time) { this.time = time; }
}
