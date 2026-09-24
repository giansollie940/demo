import { createRenderer, nextTick, type Component } from 'vue'
export type Node = { type:string; text:string; props:Record<string,any>; children:Node[]; parent:Node|null; [key:string]:any }
const node=(type:string,text=''):Node=>({type,text,props:{},children:[],parent:null,tagName:type.toUpperCase(),addEventListener(){},removeEventListener(){},getRootNode(){return globalThis.document},style:{setProperty(){}},get options(){return this.children.filter((c:Node)=>c.type==='option')}})
const renderer=createRenderer<Node,Node>({
 createElement:type=>node(type), createText:text=>node('#text',text),createComment:text=>node('#comment',text),
 setText:(n,text)=>{n.text=text},setElementText:(n,text)=>{n.text=text;n.children=[]},
 parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null,
 insert(n,parent,anchor=null){if(n.parent){const i=n.parent.children.indexOf(n);if(i>=0)n.parent.children.splice(i,1)}n.parent=parent;const i=anchor?parent.children.indexOf(anchor):-1;if(i<0)parent.children.push(n);else parent.children.splice(i,0,n)},
 insertStaticContent(content,parent,anchor){const n=node('#static',content);n.parent=parent;const i=anchor?parent.children.indexOf(anchor):-1;if(i<0)parent.children.push(n);else parent.children.splice(i,0,n);return[n,n]},
 remove(n){if(n.parent){const i=n.parent.children.indexOf(n);if(i>=0)n.parent.children.splice(i,1)}n.parent=null},
 patchProp(n,key,_old,value){n.props[key]=value},setScopeId(){},
})
export const textOf=(n:Node):string=>n.type==='#comment'?'':n.text+n.children.map(textOf).join('')
export function findAll(n:Node,predicate:(n:Node)=>boolean):Node[]{return [...(predicate(n)?[n]:[]),...n.children.flatMap(c=>findAll(c,predicate))]}
export const settle=async()=>{await Promise.resolve();await nextTick();await Promise.resolve();await nextTick()}
export function mount(component:Component,plugins:any[]=[]){const root=node('root'),app=renderer.createApp(component);plugins.forEach(p=>app.use(p));app.mount(root);return{root,app}}
export async function click(root:Node,label:string){const b=findAll(root,n=>n.type==='button'&&textOf(n).trim()===label)[0];if(!b)throw Error('Missing button: '+label);await b.props.onClick?.({});await settle()}
