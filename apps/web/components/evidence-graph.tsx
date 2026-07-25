"use client";

import type { ResearchRun } from "@verifact/core";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node
} from "@xyflow/react";
import { useMemo } from "react";

export function EvidenceGraph({ run }: { run: ResearchRun }) {
  const { nodes, edges } = useMemo(() => {
    const graphNodes: Node[] = [
      {
        id: "question",
        position: { x: 20, y: 160 },
        data: { label: run.normalizedQuestion || run.query },
        className: "graph-node graph-question",
        style: { width: 210 }
      }
    ];
    const graphEdges: Edge[] = [];

    run.claims.forEach((claim, index) => {
      graphNodes.push({
        id: claim.id,
        position: { x: 320, y: index * 145 + 20 },
        data: { label: claim.text },
        className: "graph-node graph-claim",
        style: { width: 240 }
      });
      graphEdges.push({
        id: `question-${claim.id}`,
        source: "question",
        target: claim.id,
        animated: run.status !== "complete",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#6d7c75" }
      });
    });

    const visibleSourceIds = new Set(run.evidence.map((item) => item.sourceId));
    run.sources
      .filter((source) => visibleSourceIds.has(source.id))
      .forEach((source, index) => {
        graphNodes.push({
          id: source.id,
          position: { x: 700, y: index * 112 },
          data: { label: `${source.publisher} · ${source.qualityScore}` },
          className: "graph-node graph-source",
          style: { width: 210 }
        });
      });

    run.evidence.forEach((evidence) => {
      graphEdges.push({
        id: evidence.id,
        source: evidence.claimId,
        target: evidence.sourceId,
        label: evidence.relation,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke:
            evidence.relation === "contradicts"
              ? "#ff7b6b"
              : evidence.relation === "supports"
                ? "#8ab96d"
                : "#77837d"
        },
        labelStyle: {
          fill:
            evidence.relation === "contradicts" ? "#ff9d90" : "#a8b5ae",
          fontSize: 10,
          fontFamily: "var(--font-mono)"
        }
      });
    });

    return { nodes: graphNodes, edges: graphEdges };
  }, [run]);

  return (
    <div className="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.45}
        maxZoom={1.3}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#26332d" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
