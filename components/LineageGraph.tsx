'use client'
import React, { useMemo } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Edge, Node } from 'reactflow'
import dagre from 'dagre'
import 'reactflow/dist/style.css'

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 90 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach(n => g.setNode(n.id, { width: 210, height: 72 }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - 105, y: p.y - 36 }, style: { width: 210, whiteSpace: 'pre-line', borderRadius: 12, padding: 8 } }
  })
}
export default function LineageGraph({nodes, edges}:{nodes:any[], edges:any[]}){
 const laidOut = useMemo(()=>layout(nodes, edges),[nodes,edges])
 return <div className='h-[650px] overflow-hidden rounded-2xl border bg-white'><ReactFlow nodes={laidOut} edges={edges} fitView><Background/><MiniMap/><Controls/></ReactFlow></div>
}
