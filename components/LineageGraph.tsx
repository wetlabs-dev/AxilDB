'use client'
import React, { useMemo } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Edge, MarkerType, Node } from 'reactflow'
import dagre from 'dagre'
import { useRouter, useSearchParams } from 'next/navigation'
import 'reactflow/dist/style.css'

const methodStyles: Record<string, { color: string; dash?: string; width: number }> = {
  LEAF: { color: '#2f6b45', dash: '6 5', width: 2.5 },
  CUTTING: { color: '#5f7d46', dash: '2 6', width: 2.5 },
  RHIZOME_SPLIT: { color: '#7d6a32', dash: '10 4 2 4', width: 2.8 },
  DIVISION: { color: '#7b8a3b', width: 3 },
  SEED: { color: '#b16b4a', dash: '1 5', width: 2.6 },
  TISSUE_CULTURE: { color: '#4d7c83', dash: '8 3', width: 2.4 },
  RUNNER: { color: '#3f7b58', dash: '12 6', width: 2.5 },
  OTHER: { color: '#756b5b', dash: '4 4', width: 2.2 },
}

const legend = [
  ['DIVISION', 'Division'],
  ['LEAF', 'Leaf'],
  ['CUTTING', 'Cutting'],
  ['SEED', 'Seed'],
  ['RHIZOME_SPLIT', 'Rhizome'],
] as const

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 90 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach(n => g.setNode(n.id, { width: 210, height: 72 }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const p = g.node(n.id)
    return {
      ...n,
      position: { x: p.x - 105, y: p.y - 36 },
      style: {
        width: 210,
        whiteSpace: 'pre-line',
        borderRadius: 12,
        padding: 10,
      },
    }
  })
}

function styleEdges(edges: Edge[]) {
  return edges.map((edge) => {
    const method = String(edge.data?.method || edge.label || 'OTHER')
    const style = methodStyles[method] || methodStyles.OTHER
    return {
      ...edge,
      type: 'smoothstep',
      label: method.replaceAll('_', ' '),
      labelBgPadding: [8, 4] as [number, number],
      labelBgBorderRadius: 6,
      labelBgStyle: { fill: 'rgba(255, 250, 240, .9)', stroke: '#d8cdb8' },
      markerEnd: { type: MarkerType.ArrowClosed, color: style.color },
      style: {
        stroke: style.color,
        strokeWidth: style.width,
        strokeDasharray: style.dash,
        filter: 'drop-shadow(0 1px 0 rgba(255,255,255,.8))',
      },
    }
  })
}

export default function LineageGraph({nodes, edges, selectedId}:{nodes:any[], edges:any[], selectedId?: string}){
 const router = useRouter()
 const searchParams = useSearchParams()
 const laidOut = useMemo(() => {
   const selected = nodes.map((node) => ({
     ...node,
     className: `${node.className || ''} ${node.id === selectedId ? 'lineage-selected' : ''}`,
   }))
   return layout(selected, edges)
 }, [nodes, edges, selectedId])
 const styledEdges = useMemo(()=>styleEdges(edges),[edges])
 const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
   const params = new URLSearchParams(searchParams.toString())
   params.set('root', node.id)
   router.push(`/graphs?${params.toString()}`)
 }

 return (
  <div className="lineage-canvas relative h-[720px] overflow-hidden rounded-lg border border-[#d8cdb8]">
    <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-stone-200 bg-[#fffaf0]/88 p-3 text-xs shadow-sm backdrop-blur">
      <p className="mb-2 font-semibold text-stone-800">Propagation method</p>
      <div className="grid gap-1.5">
        {legend.map(([method, label]) => {
          const style = methodStyles[method]
          return (
            <div key={method} className="flex items-center gap-2">
              <span
                className="h-0 w-9 border-t-2"
                style={{ borderColor: style.color, borderStyle: style.dash ? 'dashed' : 'solid' }}
              />
              <span>{label}</span>
            </div>
          )
        })}
      </div>
    </div>
    <ReactFlow
      nodes={laidOut}
      edges={styledEdges}
      fitView
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: 'smoothstep' }}
      onNodeClick={handleNodeClick}
    >
      <Background color="#b8c2aa" gap={26} size={1} />
      <MiniMap nodeStrokeWidth={3} maskColor="rgba(255,250,240,.72)" />
      <Controls />
    </ReactFlow>
  </div>
 )
}
