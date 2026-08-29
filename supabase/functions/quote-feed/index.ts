import { load } from "npm:cheerio@1.0.0";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

const SOURCE_ROOT="https://www.tudiendanhngon.vn";
const SOURCE_HOST="www.tudiendanhngon.vn";
const SOURCE_CATEGORY=`${SOURCE_ROOT}/danhngon/ds/strcats/180`;
const PAGE_URLS=[
  SOURCE_CATEGORY,
  `${SOURCE_CATEGORY}/p/2`,
  `${SOURCE_CATEGORY}/p/3`,
  `${SOURCE_CATEGORY}/p/4`,
];

const CACHE_MS=60*60*1000;
let memoryCache:{at:number;quotes:Quote[]}|null=null;

type Quote={
  id:string;
  text:string;
  author:string;
  url:string;
};

function reply(status:number,body:unknown){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      ...corsHeaders,
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
    },
  });
}

function clean(value:unknown){
  return String(value||"")
    .replace(/\u00a0/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function absoluteUrl(href:string){
  try{
    const url=new URL(href,SOURCE_ROOT);
    if(url.protocol!=="https:"||url.hostname!==SOURCE_HOST){
      return SOURCE_CATEGORY;
    }
    return url.toString();
  }catch{
    return SOURCE_CATEGORY;
  }
}

function quoteIdFromUrl(url:string,text:string){
  const match=url.match(/\/itemid\/(\d+)/i);
  if(match?.[1])return `td-${match[1]}`;

  let hash=2166136261;
  for(const char of text){
    hash^=char.charCodeAt(0);
    hash=Math.imul(hash,16777619);
  }
  return `td-h${(hash>>>0).toString(16)}`;
}

function authorFromScope($:any,quoteNode:any){
  let scope=$(quoteNode);

  for(let level=0;level<6;level++){
    scope=scope.parent();
    if(!scope?.length)break;

    const authorLink=scope
      .find('a[href*="/danhnhan/"]')
      .filter((_i:any,a:any)=>clean($(a).text()).length>1)
      .first();

    const linkedAuthor=clean(authorLink.text());
    if(linkedAuthor&&linkedAuthor.length<=90){
      return linkedAuthor;
    }

    const scopeText=clean(scope.text()).replace(/\bImage\b/gi," ");
    const likePos=scopeText.search(/\d+\s+người thích/i);

    if(likePos>0){
      const before=clean(scopeText.slice(0,likePos));
      const tail=before.match(
        /([A-ZÀ-ỸĐ][A-Za-zÀ-ỹĐđ0-9.'’\- ]{1,75})$/u
      );
      const candidate=clean(tail?.[1]);

      if(
        candidate&&
        candidate.length<=80&&
        !candidate.toLowerCase().includes("người thích")&&
        candidate!==clean($(quoteNode).text())
      ){
        return candidate;
      }
    }

    if(scope.find('a[href*="/danhngon/dn/itemid/"]').length>3)break;
  }

  return "Khuyết danh";
}

function parsePage(html:string){
  const $=load(html);
  const found:Quote[]=[];

  $('a[href*="/danhngon/dn/itemid/"]').each((_i,node)=>{
    const text=clean($(node).text());
    if(text.length<12||text.length>420)return;

    const href=clean($(node).attr("href"));
    const url=absoluteUrl(href);
    const author=authorFromScope($,node);
    const id=quoteIdFromUrl(url,text);

    found.push({id,text,author,url});
  });

  return found;
}

async function fetchPage(url:string){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);

  try{
    const response=await fetch(url,{
      signal:controller.signal,
      headers:{
        "User-Agent":"SoTuHoc-WiseOwl/8.4.0 (+educational quote display)",
        "Accept":"text/html,application/xhtml+xml",
        "Accept-Language":"vi,en;q=0.8",
      },
    });

    if(!response.ok){
      throw new Error(`Nguồn danh ngôn trả HTTP ${response.status}`);
    }

    return await response.text();
  }finally{
    clearTimeout(timeout);
  }
}

async function getQuotePool(){
  if(
    memoryCache&&
    Date.now()-memoryCache.at<CACHE_MS&&
    memoryCache.quotes.length
  ){
    return {quotes:memoryCache.quotes,cache:"memory"};
  }

  const results=await Promise.allSettled(
    PAGE_URLS.map(async url=>parsePage(await fetchPage(url)))
  );

  const byId=new Map<string,Quote>();
  const seenText=new Set<string>();

  for(const result of results){
    if(result.status!=="fulfilled")continue;

    for(const quote of result.value){
      const textKey=clean(quote.text).toLocaleLowerCase("vi");
      if(seenText.has(textKey))continue;
      seenText.add(textKey);
      byId.set(quote.id,quote);
    }
  }

  const quotes=[...byId.values()];

  if(!quotes.length){
    const errors=results
      .filter((item):item is PromiseRejectedResult=>item.status==="rejected")
      .map(item=>String(item.reason?.message||item.reason))
      .slice(0,4);

    throw new Error(
      errors.length
        ? `Không đọc được kho danh ngôn: ${errors.join(" | ")}`
        : "Không tìm thấy danh ngôn trên nguồn."
    );
  }

  memoryCache={at:Date.now(),quotes};
  return {quotes,cache:"refreshed"};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS"){
    return new Response("ok",{headers:corsHeaders});
  }

  if(req.method!=="POST"){
    return reply(405,{ok:false,error:"Method not allowed"});
  }

  try{
    const body=await req.json().catch(()=>({}));

    const seenIds=new Set(
      Array.isArray(body?.seenIds)
        ? body.seenIds.map((x:unknown)=>String(x)).slice(-500)
        : []
    );

    const {quotes,cache}=await getQuotePool();

    let candidates=quotes.filter(quote=>!seenIds.has(quote.id));
    let cycleReset=false;

    if(!candidates.length){
      candidates=quotes;
      cycleReset=true;
    }

    const quote=candidates[Math.floor(Math.random()*candidates.length)];

    return reply(200,{
      ok:true,
      quote,
      poolSize:quotes.length,
      remainingBeforePick:candidates.length,
      cycleReset,
      sourceUrl:SOURCE_CATEGORY,
      cache,
    });
  }catch(error){
    console.error(error);

    return reply(503,{
      ok:false,
      error:error instanceof Error
        ? error.message
        : "Không tải được danh ngôn trực tuyến",
      sourceUrl:SOURCE_CATEGORY,
    });
  }
});