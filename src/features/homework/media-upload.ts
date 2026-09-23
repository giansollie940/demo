import type { CompressedImage } from './image';
export interface UploadImage extends CompressedImage { uploadRequestId?: string; pendingId: string; uploaded: boolean; verified: boolean }
export interface MediaResponse { ok?: boolean; id?: string; upload_url?: string | null; verified?: boolean; url?: string; expires_at?: string }
interface UploadDependencies { call(action:string,payload:Record<string,unknown>):Promise<MediaResponse>; put(url:string,blob:Blob):Promise<void>; persist():Promise<void> }
export async function ensureUploaded(image:UploadImage,binding:Record<string,unknown>,deps:UploadDependencies):Promise<string>{
  if(!image.pendingId || !image.uploaded){
    image.uploadRequestId ||= crypto.randomUUID();
    const ticket=await deps.call('prepare',{...binding,upload_id:image.uploadRequestId,size_bytes:image.blob.size,width:image.width,height:image.height,checksum:image.checksum});
    if(!ticket.id)throw new Error('Chưa tạo được lượt tải ảnh.');
    image.pendingId=ticket.id;
    // A crash after this point still has a recoverable pending identifier locally.
    await deps.persist();
    if(ticket.verified){image.uploaded=true;image.verified=true;await deps.persist();}
    else{
      if(!ticket.upload_url)throw new Error('Chưa có đường dẫn tải ảnh.');
      await deps.put(ticket.upload_url,image.blob);image.uploaded=true;await deps.persist();
    }
  }
  if(!image.verified){await deps.call('seal',{class_id:binding.class_id,attachment_id:image.pendingId});image.verified=true;await deps.persist();}
  return image.pendingId;
}
