export const MAX_IMAGE_BYTES = 500_000;
export interface CompressedImage { blob: Blob; width: number; height: number; checksum: string }
interface Decoded { width: number; height: number; source?: CanvasImageSource; close(): void }
interface Codec { decode(file: File): Promise<Decoded>; encode(image: Decoded, width: number, height: number, quality: number): Promise<Blob> }
async function decode(file: File): Promise<Decoded> {
  // Browser decoders honor EXIF orientation. Canvas re-encoding strips EXIF/GPS.
  if (typeof createImageBitmap === 'function') {
    try { const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});return {width:bitmap.width,height:bitmap.height,source:bitmap,close:()=>bitmap.close()}; } catch { /* Safari may decode HEIC through an image element only. */ }
  }
  const url=URL.createObjectURL(file), image=new Image();
  try { image.src=url;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight,source:image,close:()=>{image.src='';URL.revokeObjectURL(url)}}; }
  catch(e){URL.revokeObjectURL(url);throw e;}
}
async function encode(image:Decoded,width:number,height:number,quality:number):Promise<Blob>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context||!image.source)throw new Error('Không xử lý được ảnh trên thiết bị này.');
  context.drawImage(image.source,0,0,width,height);
  try {return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Không nén được ảnh.')),'image/webp',quality));}
  finally {canvas.width=canvas.height=0;}
}
export async function compressImage(file:File,codec:Codec={decode,encode}):Promise<CompressedImage>{
  if(!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error('Chọn ảnh JPEG, PNG, WebP hoặc HEIC/HEIF.');
  if(file.size>40_000_000)throw new Error('Ảnh quá lớn để xử lý an toàn trên thiết bị. Hãy giảm dung lượng trước.');
  let image:Decoded;
  try{image=await codec.decode(file);}catch{throw new Error('Trình duyệt chưa đọc được ảnh này (HEIC/HEIF có thể chưa hỗ trợ). Hãy chuyển sang JPEG/PNG/WebP rồi chọn lại.');}
  try{
    if(!image.width||!image.height||image.width*image.height>80_000_000)throw new Error('Kích thước ảnh quá lớn để xử lý an toàn.');
    const longest=Math.max(image.width,image.height),initial=Math.min(1600,longest);
    const sizes=[initial,...[1440,1280,1120,960,800].filter(x=>x<initial)];
    let blob:Blob|null=null,width=0,height=0;
    // Try smaller dimensions at .92 before lowering quality; never crop/upscale.
    const attempts=[...sizes.map(side=>({side,quality:.92})),...[.90,.88,.85].map(quality=>({side:sizes.at(-1)!,quality}))];
    for(const {side,quality} of attempts){
      width=Math.max(1,Math.round(image.width*side/longest));height=Math.max(1,Math.round(image.height*side/longest));
      blob=await codec.encode(image,width,height,quality);
      if(blob.type!=='image/webp')throw new Error('Trình duyệt chưa hỗ trợ xuất WebP. Hãy dùng trình duyệt hỗ trợ để đính kèm ảnh.');
      if(blob.size>0 && blob.size<=MAX_IMAGE_BYTES)break;
    }
    if(!blob || !blob.size || blob.size>MAX_IMAGE_BYTES)throw new Error('Ảnh vẫn vượt 500 KB sau khi nén. Hãy chọn ảnh khác hoặc gửi bài dạng chữ.');
    const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
    return {blob,width,height,checksum:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')};
  }finally{image.close();}
}
