/**
 * Create a detached plain-data snapshot from Vue reactive proxies or normal
 * timetable data. Timetable configs are JSON-like, but undefined values are
 * meaningful for inherited day overrides, so JSON serialization is avoided.
 *
 * @param {unknown} value
 * @param {WeakMap<object, unknown>} [seen]
 * @returns {unknown}
 */
export function cloneTimetableSnapshot(value,seen=new WeakMap()){
  if(value===null||typeof value!=='object')return value
  if(seen.has(value))return seen.get(value)
  if(value instanceof Date)return new Date(value.getTime())
  if(Array.isArray(value)){
    const output=[]
    seen.set(value,output)
    for(const item of value)output.push(cloneTimetableSnapshot(item,seen))
    return output
  }
  const output={}
  seen.set(value,output)
  for(const [key,item] of Object.entries(value))output[key]=cloneTimetableSnapshot(item,seen)
  return output
}
