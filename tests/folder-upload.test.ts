import test from 'node:test'
import assert from 'node:assert/strict'
import { createMockDriveApi } from '../app/services/mock-drive-api.ts'
import { planFolderUpload, selectionFromFiles, selectionFromDrop, uploadFolderSelection } from '../app/services/folder-upload.ts'
import { createNodeLocation } from '../app/services/node-location.ts'
import type { DriveNode } from '../shared/types.ts'

function file(path: string, bytes = 'content') { const value = new File([bytes], path.split('/').at(-1)!, { type: 'text/plain' }); Object.defineProperty(value, 'webkitRelativePath', { value: path }); return value }
test('directory selection keeps nested paths, same names in different folders and empty directories', async () => {
  const api = createMockDriveApi()
  const selection = selectionFromFiles([file('Import/a/report.txt','A'), file('Import/b/report.txt','B')])
  selection.directories.push('Import/empty')
  const progress: number[] = []
  await uploadFolderSelection(api, 'ws-design', null, selection, value => progress.push(value))
  const root = (await api.listNodes('ws-design',{parentId:null})).find(node => node.name === 'Import')!
  const children = await api.listNodes('ws-design',{parentId:root.id})
  assert.deepEqual(children.map(node=>node.name).sort(), ['a','b','empty'])
  for(const folder of children.filter(node=>node.name!=='empty')) {
    const nodes=await api.listNodes('ws-design',{parentId:folder.id})
    assert.equal(nodes.length,1)
    assert.equal(await (await api.getContent('ws-design',nodes[0]!.id)).blob.text(), folder.name.toUpperCase())
  }
  assert.equal(progress.at(-1),100)
})
test('unsafe or colliding paths are rejected before any API mutation', async () => {
  const api = createMockDriveApi(), before = (await api.listNodes('ws-design')).length
  for(const path of ['../bad.txt','/bad.txt','Import//bad.txt','Import/../bad.txt','Import\\bad.txt','Import/ bad.txt']) {
    await assert.rejects(uploadFolderSelection(api,'ws-design',null,{directories:[],files:[{path,file:file(path)}]}))
  }
  assert.throws(()=>planFolderUpload({directories:['Import/a'],files:[{path:'Import/a',file:file('a')}]}))
  assert.throws(()=>selectionFromFiles([file('Import/a'),file('Import/a')]))
  assert.equal((await api.listNodes('ws-design')).length,before)
})
test('folder upload respects current Viewer permissions and existing destination ancestry', async () => {
  const api=createMockDriveApi()
  await assert.rejects(uploadFolderSelection(api,'ws-archive',null,selectionFromFiles([file('Import/a.txt')])), (error: any)=>error.status===403)
  await assert.rejects(uploadFolderSelection(api,'ws-design','foreign-node',selectionFromFiles([file('Import/a.txt')])) )
})
test('aborted folder upload performs no writes', async () => {
  const api=createMockDriveApi(), controller=new AbortController()
  controller.abort()
  await assert.rejects(uploadFolderSelection(api,'ws-design',null,selectionFromFiles([file('Import/a.txt')]),undefined,{signal:controller.signal}),{name:'AbortError'})
})
test('destination depth is checked before creating any imported directories', async () => {
  let writes=0
  const api={getNode:async (_wid:string,id:string)=>({id,workspaceId:'one',kind:'folder',name:id,parentId:Number(id)>1?String(Number(id)-1):null} as DriveNode),createFolder:async()=>{writes++;throw new Error('must not mutate')},uploadFiles:async()=>[]}
  await assert.rejects(uploadFolderSelection(api,'one','63',selectionFromFiles([file('Import/a.txt')])) , /64/)
  assert.equal(writes,0)
})
test('losing write permission between files stops the import without continuing as the previous identity', async () => {
  const api=createMockDriveApi()
  let uploads=0
  const wrapped={...api,uploadFiles:async (...args:Parameters<typeof api.uploadFiles>)=>{
    const result=await api.uploadFiles(...args)
    uploads++
    await api.login({email:'deniz@example.com',password:'Demo1234!'})
    return result
  }}
  await assert.rejects(uploadFolderSelection(wrapped,'ws-design',null,selectionFromFiles([file('Import/a.txt'),file('Import/b.txt')])),(error:any)=>error.status===403)
  assert.equal(uploads,1)
})
test('drop traversal drains all directory reader batches and preserves empty folders', async () => {
  const leaf=(path:string)=>({name:path,isFile:true,isDirectory:false,file:(done:any)=>done(file(path))})
  const empty={name:'empty',isFile:false,isDirectory:true,createReader:()=>({readEntries:(done:any)=>done([])})}
  let calls=0
  const root={name:'Import',isFile:false,isDirectory:true,createReader:()=>({readEntries:(done:any)=>done([ [leaf('a.txt')], [empty,leaf('b.txt')], [] ][calls++])})}
  const result=await selectionFromDrop({items:[{kind:'file',webkitGetAsEntry:()=>root}],files:[]} as unknown as DataTransfer)
  assert.equal(calls,3)
  assert.deepEqual(result.files.map(item=>item.path),['Import/a.txt','Import/b.txt'])
  assert.ok(result.directories.includes('Import/empty'))
})
test('location resolves actual parent from a search result and supports workspace root', async () => {
  const api=createMockDriveApi()
  const parent=await api.createFolder('ws-design',{name:'Actual parent',parentId:null})
  const [node]=await api.uploadFiles('ws-design',parent.id,[file('note.txt')])
  const location=createNodeLocation(api)
  await location.load('ws-design',node!)
  assert.equal(location.path.value.at(-1)?.name,'Actual parent')
  await location.load('ws-design',{...node!,parentId:null})
  assert.deepEqual(location.path.value,[{id:null,name:'Çalışma alanı kökü'}])
})
test('closed or replaced location cannot display late paths or errors', async () => {
  let resolve!: (node:DriveNode)=>void
  const location=createNodeLocation({getNode:()=>new Promise(done=>{resolve=done})})
  const node={id:'file',workspaceId:'one',parentId:'parent'} as DriveNode
  const pending=location.load('one',node)
  await location.load('two',{...node,workspaceId:'two',parentId:null})
  resolve({id:'parent',workspaceId:'one',parentId:null,kind:'folder',name:'Old private folder'} as DriveNode)
  await pending
  assert.deepEqual(location.path.value,[{id:null,name:'Çalışma alanı kökü'}])
  location.clear()
  assert.equal(location.path.value.length,0)
  await location.load('two',node)
  assert.equal(location.path.value.length,0)
  assert.ok(location.error.value)
})
