import type { UploadImage } from './media-upload';
export interface MediaDraft { form:Record<string,unknown>; image:UploadImage|null; attachmentId:string|null; changed:boolean; operationId:string; baseVersion:string; savedAt:number }
async function open():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')throw new Error('Trình duyệt chưa hỗ trợ lưu bản nháp trên thiết bị.');
  return new Promise((resolve,reject)=>{const r=indexedDB.open('homework-image-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
export async function draftStore(action:'get'|'put'|'delete',key:string,value?:MediaDraft):Promise<MediaDraft|undefined>{
  const db=await open();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts',action==='get'?'readonly':'readwrite');const store=tx.objectStore('drafts');
    const r=action==='get'?store.get(key):action==='put'?store.put(value,key):store.delete(key);
    tx.oncomplete=()=>resolve(action==='get'?r.result:undefined);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Không lưu được bản nháp.'));
  });}finally{db.close();}
}
