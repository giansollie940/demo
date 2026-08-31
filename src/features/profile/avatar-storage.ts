import { legacyApi } from '../../services/legacy-supabase'
import { AVATAR_MAX_BYTES } from './avatar-image.js'
import { ensureGifInfiniteLoop } from './gif-loop.js'

const AVATAR_BUCKET='avatars'
const GIF_TYPE='image/gif'
const WEBP_TYPE='image/webp'

type AvatarMime=typeof GIF_TYPE|typeof WEBP_TYPE

type StorageBucketClient={
  upload:(path:string,body:Blob,options:{cacheControl:string;contentType:AvatarMime;upsert:boolean})=>Promise<{error:unknown|null}>
  remove:(paths:string[])=>Promise<{error:unknown|null}>
}
type AvatarSupabaseClient={
  storage:{from:(bucket:string)=>StorageBucketClient}
  rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown|null}>
}

function clientFrom(value:unknown):AvatarSupabaseClient{
  if(!value||typeof value!=='object')throw new Error('Không khởi tạo được dịch vụ ảnh đại diện.')
  return value as AvatarSupabaseClient
}

function extensionFor(type:AvatarMime){return type===GIF_TYPE?'gif':'webp'}
function assertAvatarBlob(blob:Blob):AvatarMime{
  if(!(blob instanceof Blob))throw new Error('Ảnh đại diện không hợp lệ.')
  if(blob.type!==GIF_TYPE&&blob.type!==WEBP_TYPE)throw new Error('Ảnh đại diện phải là WEBP hoặc GIF.')
  if(!blob.size||blob.size>AVATAR_MAX_BYTES)throw new Error('Ảnh đại diện tối đa 5 MB.')
  return blob.type as AvatarMime
}
function avatarPath(userId:string,type:AvatarMime){return `${userId}/avatar.${extensionFor(type)}`}
function otherAvatarPath(userId:string,type:AvatarMime){return `${userId}/avatar.${type===GIF_TYPE?'webp':'gif'}`}

async function prepareUploadBlob(blob:Blob,type:AvatarMime){
  if(type!==GIF_TYPE)return blob
  const sourceBytes=new Uint8Array(await blob.arrayBuffer())
  const normalizedBytes=ensureGifInfiniteLoop(sourceBytes)
  if(normalizedBytes===sourceBytes)return blob
  const normalizedBlob=new Blob([normalizedBytes],{type:GIF_TYPE})
  if(normalizedBlob.size>AVATAR_MAX_BYTES)throw new Error('Ảnh đại diện tối đa 5 MB.')
  return normalizedBlob
}

export async function uploadOwnAvatarBlob(userId:string,blob:Blob){
  const type=assertAvatarBlob(blob)
  const uploadBlob=await prepareUploadBlob(blob,type)
  const client=clientFrom(await legacyApi.init())
  const bucket=client.storage.from(AVATAR_BUCKET)
  const path=avatarPath(userId,type)
  const stalePath=otherAvatarPath(userId,type)
  const {error:uploadError}=await bucket.upload(path,uploadBlob,{cacheControl:'3600',contentType:type,upsert:true})
  if(uploadError)throw uploadError
  const {data,error}=await client.rpc('set_own_avatar_path',{p_avatar_path:path})
  if(error){
    try{await bucket.remove([path])}catch{}
    throw error
  }
  try{await bucket.remove([stalePath])}catch{}
  return {avatarPath:String(data||path)}
}

export async function deleteOwnAvatarFiles(userId:string){
  const client=clientFrom(await legacyApi.init())
  const bucket=client.storage.from(AVATAR_BUCKET)
  const paths=[`${userId}/avatar.webp`,`${userId}/avatar.gif`]
  const {error:removeError}=await bucket.remove(paths)
  if(removeError)throw removeError
  const {error}=await client.rpc('set_own_avatar_path',{p_avatar_path:null})
  if(error)throw error
  return {avatarPath:null as null}
}
