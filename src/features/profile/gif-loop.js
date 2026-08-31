const NETSCAPE_ID='NETSCAPE2.0'
const ANIMEXTS_ID='ANIMEXTS1.0'
const LOOP_EXTENSION=Uint8Array.from([
  0x21,0xff,0x0b,
  ...[...NETSCAPE_ID].map(char=>char.charCodeAt(0)),
  0x03,0x01,0x00,0x00,0x00,
])

function isGifHeader(data){
  if(data.length<13)return false
  const header=String.fromCharCode(...data.subarray(0,6))
  return header==='GIF87a'||header==='GIF89a'
}

function colorTableEnd(data){
  const packed=data[10]
  const tableBytes=(packed&0x80)?3*(2**((packed&0x07)+1)):0
  const end=13+tableBytes
  return end<=data.length?end:-1
}

function skipSubBlocks(data,offset){
  let cursor=offset
  while(cursor<data.length){
    const size=data[cursor]
    cursor+=1
    if(size===0)return cursor
    cursor+=size
    if(cursor>data.length)return -1
  }
  return -1
}

function applicationId(data,start){
  if(start+14>data.length||data[start]!==0x21||data[start+1]!==0xff||data[start+2]!==0x0b)return ''
  return String.fromCharCode(...data.subarray(start+3,start+14))
}

export function ensureGifInfiniteLoop(input){
  const data=input instanceof Uint8Array?input:new Uint8Array(input)
  if(!isGifHeader(data))throw new Error('GIF không hợp lệ.')

  const firstBlock=colorTableEnd(data)
  if(firstBlock<0)throw new Error('GIF không hợp lệ.')

  let cursor=firstBlock
  while(cursor<data.length){
    const marker=data[cursor]
    if(marker===0x3b)break

    if(marker===0x21){
      if(cursor+2>=data.length)throw new Error('GIF không hợp lệ.')
      const label=data[cursor+1]
      if(label===0xff){
        const id=applicationId(data,cursor)
        if(id===NETSCAPE_ID||id===ANIMEXTS_ID){
          const subBlock=cursor+14
          if(
            subBlock+4<data.length&&
            data[subBlock]===0x03&&
            data[subBlock+1]===0x01
          ){
            if(data[subBlock+2]===0&&data[subBlock+3]===0)return data
            const output=data.slice()
            output[subBlock+2]=0
            output[subBlock+3]=0
            return output
          }
        }
        const next=skipSubBlocks(data,cursor+14)
        if(next<0)throw new Error('GIF không hợp lệ.')
        cursor=next
        continue
      }

      const next=skipSubBlocks(data,cursor+2)
      if(next<0)throw new Error('GIF không hợp lệ.')
      cursor=next
      continue
    }

    if(marker===0x2c){
      if(cursor+10>data.length)throw new Error('GIF không hợp lệ.')
      const packed=data[cursor+9]
      const localTableBytes=(packed&0x80)?3*(2**((packed&0x07)+1)):0
      const imageDataStart=cursor+10+localTableBytes
      if(imageDataStart>=data.length)throw new Error('GIF không hợp lệ.')
      const next=skipSubBlocks(data,imageDataStart+1)
      if(next<0)throw new Error('GIF không hợp lệ.')
      cursor=next
      continue
    }

    throw new Error('GIF không hợp lệ.')
  }

  const output=new Uint8Array(data.length+LOOP_EXTENSION.length)
  output.set(data.subarray(0,firstBlock),0)
  output.set(LOOP_EXTENSION,firstBlock)
  output.set(data.subarray(firstBlock),firstBlock+LOOP_EXTENSION.length)
  return output
}
