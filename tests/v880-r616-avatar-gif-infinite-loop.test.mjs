import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ensureGifInfiniteLoop } from '../src/features/profile/gif-loop.js'

const bytes=(...values)=>Uint8Array.from(values)
const ascii=text=>Uint8Array.from([...text].map(char=>char.charCodeAt(0)))
const concat=(...parts)=>{
  const total=parts.reduce((sum,part)=>sum+part.length,0)
  const output=new Uint8Array(total)
  let offset=0
  for(const part of parts){output.set(part,offset);offset+=part.length}
  return output
}

function baseGif(...blocks){
  return concat(
    ascii('GIF89a'),
    bytes(1,0,1,0,0,0,0),
    ...blocks,
    bytes(0x3b),
  )
}

function appLoop(loopCount){
  return concat(
    bytes(0x21,0xff,0x0b),
    ascii('NETSCAPE2.0'),
    bytes(0x03,0x01,loopCount&0xff,(loopCount>>8)&0xff,0x00),
  )
}

function findLoopCount(data){
  const signature=ascii('NETSCAPE2.0')
  for(let index=0;index<=data.length-signature.length;index+=1){
    let matches=true
    for(let offset=0;offset<signature.length;offset+=1){
      if(data[index+offset]!==signature[offset]){matches=false;break}
    }
    if(matches)return data[index+signature.length+2]|(data[index+signature.length+3]<<8)
  }
  return null
}

test('finite GIF loop count becomes infinite',()=>{
  const source=baseGif(appLoop(3))
  const output=ensureGifInfiniteLoop(source)
  assert.equal(findLoopCount(output),0)
})

test('GIF already configured for infinite looping is byte-identical',()=>{
  const source=baseGif(appLoop(0))
  const output=ensureGifInfiniteLoop(source)
  assert.deepEqual(output,source)
})

test('GIF without loop metadata receives a NETSCAPE infinite-loop extension',()=>{
  const source=baseGif()
  const output=ensureGifInfiniteLoop(source)
  assert.equal(findLoopCount(output),0)
  assert.equal(output.at(-1),0x3b)
})

test('avatar upload normalizes GIF loop metadata before sending the blob to Storage',async()=>{
  const source=await readFile(new URL('../src/features/profile/avatar-storage.ts',import.meta.url),'utf8')
  assert.match(source,/ensureGifInfiniteLoop/)
  assert.match(source,/blob\.arrayBuffer\(\)/)
  assert.match(source,/new Blob\(\[normalizedBytes\],\{type:GIF_TYPE\}\)/)
  assert.match(source,/bucket\.upload\(path,uploadBlob,/)
})
