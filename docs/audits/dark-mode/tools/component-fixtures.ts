import React from 'react'
import {renderToStaticMarkup}from'react-dom/server'
import{writeFileSync}from'node:fs'
import{DeploymentProgress}from'../../../../components/DeploymentProgress'
import{MetricChart}from'../../../../components/MetricChart'
import{PhotoFramingEditor}from'../../../../components/PhotoFramingEditor'
import{Button,DangerButton,Card,Field,TextArea,Select}from'../../../../components/ui'
import{CareCategoryBadge}from'../../../../components/CareCategoryBadge'
import{PlantTagChip}from'../../../../components/PlantTagChip'
import{careTaskTypes}from'../../../../lib/care-queue'
import type{DeploymentJob}from'../../../../lib/deployment-agent'
;(globalThis as unknown as {React: typeof React}).React=React
const h=React.createElement,now=new Date().toISOString(),html:Record<string,string>={}
for(const status of ['RUNNING','FAILED','COMPLETED']){
 const job:DeploymentJob={id:'audit-component-job',revision:'b'.repeat(40),previous:'a'.repeat(40),actor:'Fictional administrator',status,stage:status==='COMPLETED'?'COMPLETED':'BUILDING',created:now,started:now,finished:status==='RUNNING'?null:now,data:{hasMigrations:false,...(status==='FAILED'?{error:'Fictional failure — no deployment was performed.',failedStage:'BUILDING'}:{})}}
 html[`deployment-${status.toLowerCase()}`]=renderToStaticMarkup(h(DeploymentProgress,{job,events:[],reconnecting:status==='RUNNING',connectionLost:false}))
}
html['shared-controls']=renderToStaticMarkup(h(Card,{},h('h2',{},'Shared component fixture'),h('div',{className:'grid gap-4 mt-4'},h(Field,{name:'audit-name',label:'Plant name',placeholder:'Example botanical name'}),h(Field,{name:'audit-readonly',label:'Read-only field',readOnly:true,defaultValue:'Read-only specimen'}),h(Field,{name:'audit-disabled',label:'Disabled field',disabled:true,defaultValue:'Unavailable option'}),h(Select,{name:'audit-select',label:'Collection'},h('option',{},'Fictional collection')),h(TextArea,{name:'audit-notes',label:'Notes',placeholder:'Supporting care notes'}),h('div',{className:'flex flex-wrap gap-3'},h(Button,{},'Primary action'),h(Button,{disabled:true},'Disabled action'),h(DangerButton,{},'Destructive action')))))
html['photo-framing']=renderToStaticMarkup(h(PhotoFramingEditor,{src:'/splash-photos.png',fileInputName:'fixtureImage',cameraCapture:true}))
html['semantic-palettes']=renderToStaticMarkup(h(Card,{},h('h2',{},'Care categories and Plant Tags'),h('div',{className:'flex flex-wrap gap-3 mt-4'},...careTaskTypes.map(type=>h(CareCategoryBadge,{key:type,type}))),h('div',{className:'flex flex-wrap gap-3 mt-6'},...['fern','moss','sage','amber','coral','rose','sky','ocean','violet','stone'].map(colorToken=>h(PlantTagChip,{key:colorToken,tag:{id:colorToken,name:colorToken,icon:'leaf',colorToken,active:true}})))))
html['metric-chart']=renderToStaticMarkup(h(MetricChart,{title:'Synthetic memory utilization',value:'42%',subtitle:'Fictional samples; not real server telemetry.',points:[12,26,21,42,36,42].map((value,index)=>({at:new Date(Date.now()-(5-index)*60000),value})),markers:[{at:new Date(Date.now()-180000),label:'Fictional warning',severity:'WARNING',status:'OPEN',tooltip:'Visual fixture only'}]}))
writeFileSync('/tmp/axildb-dark-component-fixtures.json',JSON.stringify(html));console.log('Read-only production-component render fixtures prepared.')
